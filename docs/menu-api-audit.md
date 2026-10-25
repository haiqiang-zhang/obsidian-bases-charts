# Menu preference and public API audit

Reviewed on 2026-10-26 against the official developer documentation, the installed Obsidian 1.15.0 runtime, and all plugin UI code and styles.

## Menu preference

Use `new Menu()` for a standard command or choice menu. Obsidian chooses its rendering from **Appearance → Native menus**. Do not call `setUseNativeMenu(true/false)` just to achieve a preferred appearance: the official documentation describes this method as a forced override.

The installed desktop runtime copies the current preference into each new `Menu`. Native menus have no `.menu` DOM element; their close callback still runs through `onHide()`. Pass the trigger's `ownerDocument` to `showAtPosition()` for popout windows. Obsidian handles zoom and operating-system coordinates.

The preference does **not** turn every form or popup into an operating-system menu. Official `DropdownComponent` creates an HTML `select`. Bases property, filter, and sort configuration panels use a separate DOM implementation with inputs and pages. Modals and searchable rich-content pickers also remain application UI.

## Findings

| Surface | Implementation | Finding / action |
| --- | --- | --- |
| Date grouping | Public `Menu` in `src/ui/chartToolbar.ts` | **Fixed:** removed `setUseNativeMenu(false)`. New menus inherit the host preference. Selection, cancellation, cleanup, and owning-document behavior have tests for both rendering paths. |
| Date grouping tests | `tests/axisPanel.test.mjs` | **Fixed:** replaced the assertion requiring DOM rendering with coverage of both host preferences. The native branch has no menu DOM. |
| X/Y, Category/Values panels | Custom searchable configuration dialog using `SearchComponent`, buttons, and property controls | Not a standard command menu; remaining DOM is not a preference override. Toolbar insertion depends on private Bases DOM structure. |
| Y aggregation | Public `DropdownComponent` | Follows the official dropdown API. The platform's HTML-select popup is independent of the Native menus setting. |
| View appearance settings | Public `registerBasesView` options, including `BasesDropdownOption` | Settings are rendered by Obsidian. No native-menu override. |
| Palette selector | Custom searchable swatch picker, attached to the Bases palette setting | No `Menu` override. Preserving search and color previews requires a rich control. Its DOM adapter hides/replaces the host `select`, which is a compatibility dependency, not a public extension API. |
| Property/formula editor | Existing Obsidian Bases editor | No menu-rendering override, but entry through `controller.propertyMenu`, `pageStack`, and `showEditPage()` uses private interfaces. The public `QueryController` API does not expose a named-formula editor. |
| Chart file details | Public `Modal` | Uses the official modal API; outside the menu preference's scope. |
| Chart tooltip | Noninteractive chart overlay | Not a menu; outside this preference's scope. |

## Remaining compatibility dependencies

These are separate from the corrected menu preference bug. The plugin must not be described as using public APIs exclusively.

- **Toolbar integration:** native Bases DOM selectors and scoped CSS insert axis controls and hide the replaced Properties control (`chartToolbar.ts`, `styles.css`).
- **Palette integration:** a `MutationObserver` locates the palette setting and adds the rich picker (`chartPaletteSettings.ts`, `chartPalettePicker.ts`). A future public Bases rich-option API would remove this dependency. Public suggestion components can be evaluated separately without dropping search or previews.
- **Formula entry:** the guarded adapter invokes the existing host editor because there is no public named-formula editor API (`chartFormulaEditor.ts`). It must continue to fail gracefully when host internals change.
- **Nested Escape handling:** the axis panel uses the owning window's deprecated `event` property to identify the exact Escape already consumed by a DOM `Menu`. This is a DOM compatibility dependency; native cancellation must also work when no DOM keyboard event is supplied.

## Maintenance rules

1. Leave rendering selection to a default `Menu`; do not read private `nativeMenus` settings in production plugin code.
2. Use public menu callbacks for lifecycle, including when no menu DOM exists.
3. Use the trigger's window/document and let Obsidian perform coordinate conversion.
4. Keep rich configuration dialogs distinct from ordinary choice/command menus.
5. Describe private host adapters explicitly and recheck them when updating supported Obsidian versions.

## Validation

- In a separate Sandbox popout, enabling Native menus produced an operating-system menu with no menu DOM; choosing Week saved the setting and left the axis picker open.
- Disabling Native menus produced an Obsidian DOM menu in the owning document; choosing Month saved the setting and left the picker open.
- Restored the Sandbox's original preference after testing. No settings in the main vault were changed.
- All 226 tests, ESLint, TypeScript, and the production build passed.

## Sources

- [Official context-menu guide](https://docs.obsidian.md/Plugins/User+interface/Context+menus)
- [Menu.setUseNativeMenu](https://docs.obsidian.md/Reference/TypeScript+API/Menu/setUseNativeMenu): “Force this menu to use native or DOM.”
- [Menu.showAtPosition](https://docs.obsidian.md/Reference/TypeScript+API/Menu/showAtPosition)
- Installed Obsidian 1.15.0 runtime: `Menu`, `DropdownComponent`, Bases toolbar panels, and the Appearance → Native menus setting. Runtime details are version-specific evidence, not public API contracts.
