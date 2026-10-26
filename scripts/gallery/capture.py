#!/usr/bin/env python3
"""Capture the real plugin in a dedicated Obsidian Sandbox popout.

Copy gallery/demo-vault/Chart Gallery into Obsidian Sandbox first. This script
uses Obsidian's developer CLI and Electron's native capturePage API. It never
opens or modifies the personal vault. PNGs contain the native Bases toolbar.
"""
import argparse
import json
import subprocess
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUTPUT = REPO / 'gallery' / 'images'
FIXTURES = REPO / 'gallery' / 'demo-vault' / 'Chart Gallery'


def cli(*args):
    result = subprocess.run(['obsidian', 'vault=Obsidian Sandbox', *args],
                            capture_output=True, text=True, check=True, timeout=20)
    if result.stdout.startswith('Error:'):
        raise RuntimeError(result.stdout)
    return result.stdout.strip()


def ev(code):
    wrapper = '(async()=>{try{return await (' + code + ')}catch(e){return JSON.stringify({__error:String(e)})}})()'
    result = json.loads(cli('eval', 'code=' + wrapper).removeprefix('=> '))
    if isinstance(result, dict) and '__error' in result:
        raise RuntimeError(result['__error'])
    return result


def prepare():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    types = json.loads((FIXTURES / 'fixture-manifest.json').read_text())['property_types']
    return ev('''(async()=>{
        if(app.vault.getName()!=='Obsidian Sandbox')throw new Error('Sandbox required');
        for(const [name,type] of Object.entries(''' + json.dumps(types) + '''))await app.metadataTypeManager.setType(name,type);
        if(!window.galleryLeaf){window.galleryOriginal=app.workspace.activeLeaf?.id;window.galleryLeaf=app.workspace.getLeaf('window');}
        window.galleryLeaf.view.containerEl.win.resizeTo(860,520);
        window.galleryLeaf.view.containerEl.win.electronWindow.webContents.setBackgroundThrottling(false);
        return JSON.stringify({leaf:window.galleryLeaf.id});
    })()''')


def open_view(file, name):
    # Reopen the Base so its controller applies viewName even when consecutive
    # captures use different views of the same file.
    ev('''(async()=>{await window.galleryLeaf.setViewState({type:'empty',state:{}});
       await window.galleryLeaf.setViewState({type:'bases',state:{file:''' +
       json.dumps('Chart Gallery/' + file) + ',viewName:' + json.dumps(name) + '''}});
       return JSON.stringify(true);})()''')
    time.sleep(1.2)


def capture(name, modal=False, hover=None):
    target = OUTPUT / (name + '.png')
    result = ev('''(async()=>{const leaf=window.galleryLeaf,w=leaf.view.containerEl.win;
        if(app.vault.getName()!=='Obsidian Sandbox'||w===window)throw new Error('Dedicated Sandbox popout required');
        // Park the pointer in this test window's tab strip to dismiss hover tips.
        w.electronWindow.webContents.sendInputEvent({type:'mouseMove',x:5,y:5});
        // Finish chart entrance animations even while the popout is behind
        // another app. Only capture-time animation is changed, never data/style.
        const view=leaf.view.controller.view;
        for(const renderer of (view.layout?.renderers??[view.renderer])){
            if(!renderer?.chart)continue;
            const option=renderer.chart.getOption();option.animation=false;
            renderer.chart.setOption(option,{notMerge:true});renderer.chart.getZr().flush();
        }
        ''' + ('''
        const hovered=view.layout.renderers[0],c=hovered.chart;
        const si=''' + str(hover[0]) + ''',di=''' + str(hover[1]) + ''';
        const o=c.getOption(), datum=o.series[si].data[di];
        const point=c.convertToPixel({seriesIndex:si},o.xAxis[0].type==='category'?[di,datum.value]:datum.value);
        const box=hovered.containerEl.getBoundingClientRect();
        w.electronWindow.webContents.sendInputEvent({type:'mouseMove',x:Math.round(box.x+point[0]),y:Math.round(box.y+point[1])});
        ''' if hover is not None else '') + '''
        await new Promise(resolve=>w.setTimeout(resolve,180));
        const el=leaf.view.containerEl.querySelector('.view-content');
        const r=el.getBoundingClientRect();
        ''' + ('''
        const modal=w.document.querySelector('.bases-chart-files-modal');
        if(!modal)throw new Error('Open the data dialog before capturing it');
        const m=modal.getBoundingClientRect();
        if(m.top<r.top||m.left<r.left||m.right>r.right||m.bottom>r.bottom)
            throw new Error('Resize the test window to include the complete dialog and chart background');
        ''' if modal else '') + '''
        const rect={x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)};
        const img=await w.electronWindow.capturePage(rect);
        require('fs').writeFileSync(''' + json.dumps(str(target)) + ''',img.toPNG());
        return JSON.stringify({file:''' + json.dumps(target.name) + ''',size:img.getSize(),viewport:[w.innerWidth,w.innerHeight],zoom:w.electronWindow.webContents.getZoomFactor(),view:leaf.view.getState()});
    })()''')
    metadata_path = REPO / 'gallery' / 'capture-manifest.json'
    metadata = json.loads(metadata_path.read_text()) if metadata_path.exists() else {"captures": []}
    prior = next((x for x in metadata['captures'] if x['file'] == result['file']), None)
    if prior is None:
        prior = {"file": result['file']}
        metadata['captures'].append(prior)
    prior.update({key: result[key] for key in ['viewport', 'zoom', 'view']})
    metadata_path.write_text(json.dumps(metadata, indent=2) + '\n')
    print(json.dumps(result))
    return result


def close():
    return ev('''(()=>{for(const leaf of (window.gallerySplitLeaves??[]).slice(1))leaf.detach();
        window.galleryLeaf?.detach();const original=app.workspace.getLeafById(window.galleryOriginal);
        if(original)app.workspace.setActiveLeaf(original,{focus:false});
        delete window.galleryLeaf;delete window.galleryOriginal;delete window.gallerySplitLeaves;
        return JSON.stringify(true)})()''')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--close', action='store_true')
    parser.add_argument('--current', help='Capture the current dedicated gallery view under this image name')
    parser.add_argument('--modal', action='store_true', help='Include the complete data dialog over its chart view')
    args = parser.parse_args()
    if args.close:
        close()
    elif args.current:
        if Path(args.current).name != args.current:
            parser.error('Use an image name, not a path')
        capture(args.current.removesuffix('.png'), args.modal)
    else:
        prepare()
        views = json.loads((FIXTURES / 'fixture-manifest.json').read_text())['views']
        names = ['01-line', '02-bar', '03-area', '04-pie', '05-radar', '06-scatter']
        for view, name in zip(views, names):
            open_view(view['file'], view['name'])
            capture(name)
