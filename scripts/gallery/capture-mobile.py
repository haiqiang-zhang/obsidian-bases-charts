#!/usr/bin/env python3
"""Capture the English mobile gallery in Obsidian Sandbox.

Install the current plugin build and gallery fixtures in the Sandbox first.
This script never copies plugin files. It uses Obsidian's official mobile
emulator, CDP touch input, and native PNG captures (390 x 844
portrait and 1024 x 768 large landscape CSS pixels at 2x density). These are not
physical-device screenshots. Native capture bounds exclude the measured unused
top status area; the original viewport and crop are recorded separately. No
image pixels are retouched after capture.

The default command captures all fourteen images and restores the saved Sandbox
workspace. For inspection, use --prepare or --view FILE VIEW, then --current
NAME. Finish with --close. Recovery state is stored outside the vault in
/private/tmp so --close can recover after an interrupted Python process.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import time

from capture import REPO, cli, ev

GALLERY = REPO / 'gallery' / 'mobile'
OUTPUT = GALLERY / 'images'
METADATA = GALLERY / 'capture-metadata.json'
DEFAULT_VIEWPORT = (390, 844)
SCALE = 2
SESSION = Path('/private/tmp') / (
    'bases-charts-mobile-gallery-' + hashlib.sha256(str(REPO).encode()).hexdigest()[:12] + '.json'
)
GUARD = "if(app.vault.getName()!=='Obsidian Sandbox')throw new Error('Sandbox required');"
LEAF = "const leaf=window.mobileGalleryLeaf;if(!leaf)throw new Error('Run --prepare first');"
VIEWS = [
    ('01 Trend.base', 'Weekly momentum', '01-line'),
    ('02 Workstreams.base', 'Projects by workstream', '02-bar'),
    ('03 Capacity.base', 'A season of progress', '03-area'),
    ('04 Focus mix.base', 'Where the time goes', '04-pie'),
    ('05 Skills.base', 'A balanced practice', '05-radar'),
    ('06 Effort and impact.base', 'Effort & impact', '06-scatter'),
]


def evaluate(code):
    return ev('(async()=>{' + GUARD + code + '})()')


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                     prefix=path.name + '.', delete=False) as temporary:
        json.dump(value, temporary, indent=2)
        temporary.write('\n')
        temporary_path = temporary.name
    os.replace(temporary_path, path)


def session_state():
    if not SESSION.exists():
        raise RuntimeError('No mobile-gallery session. Run --prepare first.')
    state = json.loads(SESSION.read_text(encoding='utf-8'))
    if state.get('repo') != str(REPO) or state.get('vault') != 'Obsidian Sandbox':
        raise RuntimeError('Unexpected capture recovery state: ' + str(SESSION))
    return state


def cdp(method, params):
    return cli('dev:cdp', 'method=' + method, 'params=' + json.dumps(params))


def wait_for(code, description, timeout=30):
    deadline = time.monotonic() + timeout
    last_error = None
    while time.monotonic() < deadline:
        try:
            result = evaluate('return JSON.stringify(' + code + ');')
            if result:
                return result
        except (RuntimeError, ValueError, OSError, subprocess.SubprocessError) as error:
            # The official emulator reloads Obsidian; eval is briefly unavailable.
            last_error = error
        time.sleep(.25)
    raise RuntimeError('Timed out waiting for ' + description +
                       (': ' + str(last_error) if last_error else ''))


def assert_clear():
    blockers = evaluate('''return JSON.stringify(Array.from(document.querySelectorAll('.modal,.menu'))
        .filter(el=>el.getClientRects().length).map(el=>({classes:el.className,
        title:el.querySelector('.modal-title,.bases-toolbar-menu-title')?.textContent??''})));''')
    if blockers:
        raise RuntimeError('Dismiss the visible Sandbox dialog/menu before continuing: ' + json.dumps(blockers))


def set_theme(theme):
    evaluate('''const dark=''' + json.dumps(theme == 'dark') + ''';
        const changed=document.body.classList.contains('theme-dark')!==dark;
        document.body.classList.toggle('theme-dark',dark);
        document.body.classList.toggle('theme-light',!dark);
        if(changed)app.workspace.trigger('css-change');
        return JSON.stringify(changed);''')
    time.sleep(.25)


def set_viewport(width, height):
    """Resize the official emulator without changing native window bounds."""
    if width <= 0 or height <= 0:
        raise ValueError('Viewport dimensions must be positive')
    state = session_state()
    cdp('Emulation.setDeviceMetricsOverride', {
        'width': width, 'height': height, 'deviceScaleFactor': SCALE, 'mobile': True,
    })
    wait_for(f'window.innerWidth==={width}&&window.innerHeight==={height}&&window.devicePixelRatio==={SCALE}',
             f'{width} x {height} mobile viewport at {SCALE}x density')
    state['viewport'] = [width, height]
    write_json(SESSION, state)
    time.sleep(.4)


def prepare(viewport=DEFAULT_VIEWPORT):
    """Save the existing Sandbox state, then create this script's own mobile tab."""
    OUTPUT.mkdir(parents=True, exist_ok=True)
    if SESSION.exists():
        state = session_state()
    else:
        assert_clear()
        state = evaluate('''return JSON.stringify({
            vault:app.vault.getName(),mobile:!!app.isMobile,
            theme:document.body.classList.contains('theme-dark')?'dark':'light',
            zoom:window.electronWindow.webContents.getZoomFactor(),
            layout:app.workspace.getLayout(),activeLeaf:app.workspace.activeLeaf?.id??null
        });''')
        state.update({'repo': str(REPO), 'created_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
        write_json(SESSION, state)
    mobile = evaluate('return JSON.stringify(!!app.isMobile);')
    if not mobile:
        cli('dev:mobile', 'on')
        wait_for('!!app.isMobile', 'official mobile emulator reload')
    evaluate('window.electronWindow.webContents.setZoomFactor(1);return JSON.stringify(true);')
    set_viewport(*viewport)
    cdp('Emulation.setTouchEmulationEnabled', {'enabled': True, 'maxTouchPoints': 1})
    assert_clear()
    working_leaf = evaluate('''window.electronWindow.webContents.setZoomFactor(1);
        window.mobileGalleryLeaf=window.mobileGalleryLeaf??app.workspace.getLeafById(''' +
        json.dumps(state.get('working_leaf', '')) + ''')??app.workspace.getLeaf('tab');
        app.workspace.setActiveLeaf(window.mobileGalleryLeaf,{focus:false});
        app.workspace.leftSplit?.collapse();app.workspace.rightSplit?.collapse();
        return JSON.stringify(window.mobileGalleryLeaf.id);''')
    state['working_leaf'] = working_leaf
    state['viewport'] = list(viewport)
    write_json(SESSION, state)
    set_theme('light')
    return {'leaf': working_leaf, 'recovery_state': str(SESSION)}


def open_view(file, name):
    """Open a gallery Base in the owned tab, including same-file view switches."""
    session_state()
    if Path(file).name != file or not file.endswith('.base'):
        raise ValueError('Use a .base filename from Chart Gallery, without a path')
    assert_clear()
    evaluate(LEAF + '''await leaf.setViewState({type:'empty',state:{}});
        await leaf.setViewState({type:'bases',state:{file:''' + json.dumps('Chart Gallery/' + file) +
        ',viewName:' + json.dumps(name) + '''}});
        app.workspace.setActiveLeaf(leaf,{focus:false});
        await app.workspace.revealLeaf(leaf);return JSON.stringify(true);''')
    wait_for('!!window.mobileGalleryLeaf?.view.controller?.view.layout?.renderers?.some(r=>r.chart)',
             'the chart renderer')
    time.sleep(1.2)


def touch_tap(x, y):
    """Use the same CDP touch sequence as a real tap, never a DOM click()."""
    viewport = session_state().get('viewport', DEFAULT_VIEWPORT)
    if not 0 < x < viewport[0] or not 0 < y < viewport[1]:
        raise ValueError(f'Touch target outside the mobile viewport: {x}, {y}')
    cdp('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]})
    try:
        time.sleep(.08)
    finally:
        cdp('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
    time.sleep(.45)


def tap_selector(selector, scope='document'):
    point = evaluate('''const candidates=Array.from(''' + scope + '.querySelectorAll(' + json.dumps(selector) + '''))
        .filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden');
        if(!candidates.length)throw new Error('Visible touch target not found: '+''' + json.dumps(selector) + ''');
        const el=candidates[0],r=el.getBoundingClientRect();
        const x=(Math.max(0,r.left)+Math.min(innerWidth,r.right))/2;
        const y=(Math.max(0,r.top)+Math.min(innerHeight,r.bottom))/2;
        if(r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth)
            throw new Error('Touch target is offscreen');
        const hit=document.elementFromPoint(x,y);
        if(!hit||!(hit===el||el.contains(hit)))throw new Error('Touch target is covered');
        return JSON.stringify({x,y});''')
    touch_tap(point['x'], point['y'])


def wait_visible(selector):
    wait_for('Array.from(document.querySelectorAll(' + json.dumps(selector) +
             ')).some(el=>el.getClientRects().length)', selector)
    time.sleep(.35)


def close_sheet(selector):
    tap_selector(selector + ' .modal-header-button')
    wait_for('!document.querySelector(' + json.dumps(selector) + ')', 'native sheet dismissal')


def select_chart_point(series_index=0, data_index=0):
    """Tap rendered data geometry so portrait captures show a real selection."""
    assert_clear()
    point = evaluate(LEAF + '''const renderer=leaf.view.controller.view.layout.renderers[0];
        const chart=renderer.chart,option=chart.getOption();
        const si=Math.min(''' + str(series_index) + ''',option.series.length-1),series=option.series[si];
        const di=Math.min(''' + str(data_index) + ''',series.data.length-1),datum=series.data[di];
        if(!datum?._raw)throw new Error('Selectable sample data is missing');
        let point;
        if(series.type==='pie'){
            const layout=chart.getModel().getSeriesByIndex(si).getData().getItemLayout(di);
            const angle=(layout.startAngle+layout.endAngle)/2,radius=(layout.r+layout.r0)/2;
            point=[layout.cx+Math.cos(angle)*radius,layout.cy+Math.sin(angle)*radius];
        }else if(series.type==='radar'){
            point=chart.getModel().getSeriesByIndex(si).getData().getItemLayout(di)[0];
        }else{
            point=chart.convertToPixel({seriesIndex:si},option.xAxis[0].type==='category'?[di,datum.value]:datum.value);
            if(!chart.containPixel({gridIndex:0},point))throw new Error('Sample point is outside the plot');
        }
        if(!point?.every(Number.isFinite))throw new Error('Invalid sample point geometry');
        const box=renderer.containerEl.getBoundingClientRect();
        return JSON.stringify({x:Math.round(box.x+point[0]),y:Math.round(box.y+point[1])});''')
    touch_tap(point['x'], point['y'])
    wait_visible('.bases-chart-touch-preview-footer button')


def select_chart_column(label='Aug 31'):
    """Select an actual area-chart column containing the sample source files."""
    assert_clear()
    point = evaluate(LEAF + '''const renderer=leaf.view.controller.view.layout.renderers[0];
        const chart=renderer.chart,option=chart.getOption(),series=option.series[0];
        const index=series.data.findIndex(d=>String(d._raw?.x)===''' + json.dumps(label) + ''');
        if(index<0)throw new Error('Sample column is missing');
        const datum=series.data[index];
        const point=chart.convertToPixel({seriesIndex:0},option.xAxis[0].type==='category'?[index,datum.value]:datum.value);
        if(!chart.containPixel({gridIndex:0},point))throw new Error('Sample point is outside the plot');
        const box=renderer.containerEl.getBoundingClientRect();
        return JSON.stringify({x:Math.round(box.x+point[0]),y:Math.round(box.y+point[1])});''')
    touch_tap(point['x'], point['y'])
    wait_visible('.bases-chart-touch-preview-footer button')


def open_data_drawer(label='Aug 31'):
    """Select a portrait preview, then use its View data action."""
    select_chart_column(label)
    tap_selector('.bases-chart-touch-preview-footer button')
    wait_visible('.bases-chart-files-modal')


def capture(name, theme='light'):
    """Capture native UI below unused emulator status space, without retouching."""
    viewport = session_state().get('viewport', DEFAULT_VIEWPORT)
    if Path(name).name != name or name in ('', '.', '..'):
        raise ValueError('Use an image name, not a path')
    name = name.removesuffix('.png') + '.png'
    set_theme(theme)
    result = evaluate(LEAF + '''if(!app.isMobile)throw new Error('Official mobile emulation required');
        const view=leaf.view.controller.view;
        for(const renderer of(view.layout?.renderers??[view.renderer])){
            if(!renderer?.chart)continue;
            const option=renderer.chart.getOption();option.animation=false;
            renderer.chart.setOption(option,{notMerge:true});renderer.chart.getZr().flush();
        }
        const header=leaf.containerEl.querySelector('.view-header');
        if(!header)throw new Error('Native view header required to measure capture bounds');
        const headerTop=header.getBoundingClientRect().top;
        const safeTop=parseFloat(getComputedStyle(document.body).getPropertyValue('--safe-area-inset-top'));
        if(!Number.isFinite(safeTop)||safeTop<0||safeTop>innerHeight/4)
            throw new Error('Unexpected native top safe-area measurement');
        let top=Math.max(0,Math.floor(Math.min(safeTop,headerTop)));
        // A native sheet/menu may put controls above the underlying view header.
        // Include those controls rather than clipping any visible interface.
        for(const el of document.querySelectorAll('button,input,[role="button"],.clickable-icon,.modal-header-button')){
            const r=el.getBoundingClientRect();
            if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden'||r.bottom<=0
                ||r.right<=0||r.left>=innerWidth||r.width===0||r.height===0)continue;
            if(r.top>=0&&r.top<top)top=Math.floor(r.top);
        }
        // Preserve a small margin around native button shadows at the boundary.
        top=Math.max(0,top-8);
        const crop={x:0,y:top,width:innerWidth,height:innerHeight-top};
        return JSON.stringify({viewport:[innerWidth,innerHeight],crop,device_scale_factor:devicePixelRatio,
            zoom:window.electronWindow.webContents.getZoomFactor(),view:leaf.view.getState(),
            theme:document.body.classList.contains('theme-dark')?'dark':'light'});''')
    if result['viewport'] != list(viewport) or result['device_scale_factor'] != SCALE or result['zoom'] != 1:
        raise RuntimeError('Unexpected viewport, density, or zoom: ' + json.dumps(result))
    time.sleep(.3)
    target = OUTPUT / name
    evaluate('''const image=await window.electronWindow.capturePage(''' + json.dumps(result['crop']) + ''');
        require('fs').writeFileSync(''' + json.dumps(str(target)) + ''',image.toPNG());
        return JSON.stringify(image.getSize());''')
    data = target.read_bytes()
    expected_size = tuple(round(result['crop'][key] * SCALE) for key in ('width', 'height'))
    if data[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack('>II', data[16:24]) != expected_size:
        raise RuntimeError(f'Expected an original {expected_size[0]} x {expected_size[1]} PNG: ' + str(target))
    result['file'] = name
    result['captured_at'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    metadata = json.loads(METADATA.read_text(encoding='utf-8')) if METADATA.exists() else {'captures': []}
    metadata['captures'] = [item for item in metadata['captures'] if item['file'] != name] + [result]
    metadata['captures'].sort(key=lambda item: item['file'])
    write_json(METADATA, metadata)
    print(json.dumps({'path': str(target), **result}), flush=True)
    return result


def close(restore_mode='original'):
    """Clear CDP overrides and restore the saved Sandbox layout, theme and zoom."""
    state = session_state()
    # Only this script's own plugin dialogs are dismissed; unrelated dialogs
    # are never clicked. The saved workspace also removes the owned chart tab.
    for selector in ('.bases-chart-files-modal', '.bases-chart-axis-modal'):
        present = evaluate('return JSON.stringify(!!document.querySelector(' + json.dumps(selector) + '));')
        if present:
            close_sheet(selector)
    palette_menu = evaluate("return JSON.stringify(!!document.querySelector('.bases-toolbar-menu .bases-chart-palette-trigger'));")
    if palette_menu:
        tap_selector('.bases-toolbar-menu-header-end > .clickable-icon')
    cdp('Emulation.setTouchEmulationEnabled', {'enabled': False})
    cdp('Emulation.clearDeviceMetricsOverride', {})
    desired_mobile = state['mobile'] if restore_mode == 'original' else restore_mode == 'mobile'
    current_mobile = evaluate('return JSON.stringify(!!app.isMobile);')
    if desired_mobile != current_mobile:
        cli('dev:mobile', 'on' if desired_mobile else 'off')
        wait_for('!!app.isMobile===' + json.dumps(desired_mobile), 'emulator restoration')
    evaluate('''await app.workspace.changeLayout(''' + json.dumps(state['layout']) + ''');
        const original=app.workspace.getLeafById(''' + json.dumps(state['activeLeaf'] or '') + ''');
        if(original)app.workspace.setActiveLeaf(original,{focus:false});
        window.electronWindow.webContents.setZoomFactor(''' + json.dumps(state['zoom']) + ''');
        delete window.mobileGalleryLeaf;return JSON.stringify(true);''')
    set_theme(state['theme'])
    SESSION.unlink()
    return {'restored': True, 'mobile': desired_mobile, 'theme': state['theme']}


def capture_all():
    prepare()
    for file, view, name in VIEWS:
        open_view(file, view)
        if name == '03-area':
            select_chart_column()
        else:
            select_chart_point(1 if name in ('01-line', '06-scatter') else 0,
                               4 if name in ('01-line', '06-scatter') else 0)
        capture(name)
    open_view('01 Trend.base', 'Calendar weeks')
    tap_selector('.bases-chart-x-menu button', 'window.mobileGalleryLeaf.view.containerEl')
    wait_visible('.bases-chart-axis-modal')
    capture('07-date-grouping')
    close_sheet('.bases-chart-axis-modal')
    open_view('01 Trend.base', 'Hours & deliverables')
    tap_selector('.bases-chart-y-menu button', 'window.mobileGalleryLeaf.view.containerEl')
    wait_visible('.bases-chart-axis-modal')
    capture('08-y-properties')
    close_sheet('.bases-chart-axis-modal')
    open_view('03 Capacity.base', 'A season of progress')
    tap_selector('.bases-toolbar-views-menu .text-icon-button', 'window.mobileGalleryLeaf.view.containerEl')
    wait_visible('.bases-toolbar-menu')
    tap_selector('.bases-toolbar-menu-item.mod-active .bases-toolbar-menu-item-icon')
    wait_visible('.bases-chart-palette-trigger')
    tap_selector('.bases-chart-palette-trigger')
    wait_visible('.bases-chart-palette-popover')
    capture('09-color-palettes')
    tap_selector('.bases-chart-palette-trigger')
    tap_selector('.bases-toolbar-menu-header-end > .clickable-icon')
    assert_clear()
    open_data_drawer()
    capture('10-data-drawer')
    close_sheet('.bases-chart-files-modal')
    open_view('01 Trend.base', 'Hours & deliverables')
    select_chart_point(1, 4)
    capture('11-multiple-measures')
    open_view('03 Capacity.base', 'A season of progress')
    set_theme('dark')
    select_chart_column()
    capture('12-dark', 'dark')
    set_theme('light')
    open_view('01 Trend.base', 'Weekly momentum')
    wait_visible('.bases-chart-touch-preview-empty')
    capture('13-touch-preview')
    set_viewport(1024, 768)
    open_view('03 Capacity.base', 'A season of progress')
    wait_for("!Array.from(document.querySelectorAll('.bases-chart-touch-preview')).some(el=>el.getClientRects().length)",
             'full chart without a landscape preview panel')
    capture('14-landscape')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--prepare', action='store_true', help='Prepare a session and leave it open for inspection')
    mode.add_argument('--view', nargs=2, metavar=('FILE', 'VIEW'), help='Open a gallery .base file and named view')
    mode.add_argument('--current', metavar='NAME', help='Capture the current owned view, including any open sheet')
    mode.add_argument('--close', action='store_true', help='Restore the saved Sandbox session')
    parser.add_argument('--theme', choices=('light', 'dark'), default='light', help='Theme for --current or --view')
    parser.add_argument('--viewport', nargs=2, type=int, metavar=('WIDTH', 'HEIGHT'),
                        help='CSS viewport for manual --prepare, --view or --current captures')
    parser.add_argument('--restore-mode', choices=('original', 'desktop', 'mobile'), default='original',
                        help='Emulator mode after --close; defaults to the saved original mode')
    args = parser.parse_args()
    if args.restore_mode != 'original' and not args.close:
        parser.error('--restore-mode is only supported with --close')
    if args.viewport and (not (args.prepare or args.view or args.current) or min(args.viewport) <= 0):
        parser.error('--viewport requires positive dimensions and --prepare, --view or --current')
    if args.close:
        print(json.dumps(close(args.restore_mode)))
    elif args.current:
        if args.viewport:
            set_viewport(*args.viewport)
        capture(args.current, args.theme)
    elif args.prepare or args.view:
        print(json.dumps(prepare(args.viewport or DEFAULT_VIEWPORT)))
        if args.view:
            open_view(*args.view)
            set_theme(args.theme)
    else:
        try:
            capture_all()
        except BaseException:
            if SESSION.exists():
                try:
                    print(json.dumps(close()))
                except Exception as error:
                    print('Automatic restoration failed; recovery state remains at ' + str(SESSION) +
                          '. Run --close after resolving: ' + str(error), file=sys.stderr)
            raise
        else:
            print(json.dumps(close()))


if __name__ == '__main__':
    main()
