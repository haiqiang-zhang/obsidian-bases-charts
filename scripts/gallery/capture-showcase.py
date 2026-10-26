#!/usr/bin/env python3
"""Capture the 15 English gallery views in one isolated Sandbox popout.

Generate/copy the fixtures first. The Sandbox must run the source build being
recorded. This script only operates on its own popout and restores it on exit.
"""
import time
from capture import capture, close, ev, open_view, prepare


def run(code):
    return ev('(()=>{' + code + ';return JSON.stringify(true)})()')


def resize(width=860, height=520):
    run(f'window.galleryLeaf.view.containerEl.win.resizeTo({width},{height})')
    time.sleep(.25)


def close_menu():
    run('window.galleryLeaf.view.containerEl.doc.querySelector(".menu .bases-toolbar-menu-header-end > .clickable-icon")?.click()')


def main():
    prepare()
    run('window.galleryLeaf.view.containerEl.win.electronWindow.webContents.setZoomFactor(1)')
    for file, name, shot, height in [
        ('01 Trend.base', 'Weekly momentum', '01-line', 520),
        ('02 Workstreams.base', 'Projects by workstream', '02-bar', 520),
        ('03 Capacity.base', 'A season of progress', '03-area', 520),
        ('04 Focus mix.base', 'Where the time goes', '04-pie', 520),
        ('05 Skills.base', 'A balanced practice', '05-radar', 660),
        ('06 Effort and impact.base', 'Effort & impact', '06-scatter', 520),
    ]:
        resize(height=height)
        open_view(file, name)
        capture(shot)

    open_view('03 Capacity.base', 'A season of progress')
    capture('overview', hover=(0, 4))
    run('window.galleryLeaf.view.containerEl.doc.body.classList.replace("theme-light","theme-dark");window.galleryLeaf.view.controller.view.layout.update()')
    capture('11-dark')
    run('window.galleryLeaf.view.containerEl.doc.body.classList.replace("theme-dark","theme-light");window.galleryLeaf.view.controller.view.layout.update()')

    resize(height=660)
    run('window.galleryLeaf.view.containerEl.querySelector(".bases-toolbar-views-menu .text-icon-button").click()')
    run('window.galleryLeaf.view.containerEl.doc.querySelector(".bases-toolbar-menu-item.mod-active .bases-toolbar-menu-item-icon").click()')
    time.sleep(.25)
    run('window.galleryLeaf.view.containerEl.doc.querySelector(".bases-chart-palette-trigger").click()')
    capture('07-color-palettes')
    run('window.galleryLeaf.view.containerEl.doc.querySelector(".bases-chart-palette-trigger").click()')
    close_menu()

    resize(height=560)
    open_view('01 Trend.base', 'Calendar weeks')
    run('window.galleryLeaf.view.controller.view.openAxisSettings("x")')
    capture('08-date-grouping')
    run('window.galleryLeaf.view.containerEl.doc.querySelector(".bases-chart-axis-panel button[aria-label=Close]").click()')
    open_view('01 Trend.base', 'Weekly momentum')
    run('window.galleryLeaf.view.controller.view.openAxisSettings("x")')
    run('window.galleryLeaf.view.containerEl.doc.querySelector(".bases-chart-selected-property .bases-chart-property-edit").click()')
    run('window.galleryLeaf.view.containerEl.doc.activeElement?.blur()')
    capture('13-formula-editor')
    close_menu()

    resize(1040, 520)
    open_view('01 Trend.base', 'Hours & deliverables')
    capture('12-multiple-measures')
    open_view('01 Trend.base', 'Column selection')
    capture('14-column-hover', hover=(0, 4))

    resize(1120, 900)
    open_view('03 Capacity.base', 'A season of progress')
    ev('''(async()=>{
        const leaf=window.galleryLeaf;
        await app.workspace.revealLeaf(leaf);
        app.workspace.setActiveLeaf(leaf,{focus:false});
        const v=leaf.view.controller.view,r=v.layout.renderers[0];
        const points=r.chart.getOption().series.map(s=>s.data.find(d=>d._raw?.x==='Aug 31')).filter(Boolean).map(d=>d._raw);
        r.tooltip.openFiles(points,r.tooltipContext);
        r.tooltip.modal.modalEl.querySelector('input')?.blur();
        return JSON.stringify(true);
    })()''')
    capture('09-data-details', modal=True)
    run('window.galleryLeaf.view.controller.view.layout.renderers[0].tooltip.modal.close()')

    resize()
    open_view('10 AI insights.base', 'Reference library')
    # Saved-option renderer demonstration. No AI generation is claimed.
    run('window.galleryLeaf.view.controller.view.renderFromConfig()')
    capture('10-ai-chart')


if __name__ == '__main__':
    try:
        main()
    finally:
        close()
