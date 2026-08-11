# Kiến — Godot 4 (prod)

Порт прототипа (`../prototype`, TypeScript + Three.js) на **Godot 4** (GDScript).
Сохранены вся логика, физика и параметры тюнинга.

## Запуск
Открыть папку `prod/` в Godot 4 (проверено на 4.7.1) и нажать «Play» (F5).
Главная сцена — `main.tscn` (один узел `Node3D` со скриптом `game.gd`, который строит весь мир из кода).

## Управление
- **ЛКМ / палец** — мазок текущим инструментом (клик = точечное действие).
- **1** тряпка · **2** спрей · **3** веник.
- **H** — тепловая карта феромона (дебаг).
- **G** — панель тюнинга.

## Что где (карта TS → GDScript)
| Прототип (TS) | Godot (GDScript) |
|---|---|
| `config.ts` | `scripts/config.gd` — автолоад-синглтон `Config` (плоские поля, к ним привязана панель) |
| `surfaces.ts` | `scripts/surface.gd` (`Surface`) + `scripts/geom.gd` (layout, швы, `map_across`, `disc_footprints`) |
| `field.ts` | `scripts/field.gd` |
| `liquid.ts` | `scripts/liquid.gd` + `shaders/liquid.gdshader` |
| `crumbs.ts` | `scripts/crumbs.gd` (MultiMesh) |
| `ants.ts` | `scripts/ants.gd` (MultiMesh) |
| `messes.ts` | `scripts/messes.gd` |
| `tools.ts` | `scripts/tools.gd` |
| `interact.ts` | `scripts/interact.gd` |
| `scene.ts` + `main.ts` | `scripts/game.gd` |
| `hud.ts` + `debug.ts` (lil-gui) | `scripts/hud.gd` |
| курсор с clipping planes | `shaders/cursor.gdshader` |

## Инженерные заметки (отличия от Three.js)
- **Fixed-step** симуляция — в `_physics_process` (60 Гц); отрисовка инстансов/текстур — в `_process`.
- **`PackedFloat32Array` — value-type (copy-on-write)**, не как `Float32Array`. Поэтому паттерн
  «взять локаль → мутировать → записать обратно» (`grids[si] = g`). Прямая индексация членов
  (`px[i] = …`) и цепочки (`grids[si][i] = …`) пишут на месте.
- **Инстансинг** — `MultiMeshInstance3D`. У MultiMesh рисуются ВСЕ инстансы, поэтому живой хвост
  ограничен `visible_instance_count`, мёртвые в пределах — нулевым масштабом.
- **Жидкость** — CPU держит только сырое поле (RG8: R=влага, G=спрей), заливает в
  `ImageTexture` и только изменённый прямоугольник (`_dirty`-rect); весь композитинг
  (smoothstep/шум/цвет/ободок) — на GPU в `shaders/spill.gdshader`. Это критично для fps:
  smoothstep по ~45k клеток каждый кадр в GDScript ронял fps до 4–6. Разрешение = `LIQ` (=3).
- **UV наложение текстур** считается из мировой позиции в шейдере (`s_origin/s_u/s_v`),
  чтобы не зависеть от UV-конвенции `PlaneMesh`. Хитмап — passthrough `shaders/liquid.gdshader`.
- **`food_amount`/`wet_surfaces`** сэмплируют грубую сетку (не все мелкие клетки), т.к.
  дёргаются каждый кадр притоком муравьёв.
- **Порядок отрисовки**: жидкость (`render_priority 0`) → муравьи (`5`, `no_depth_test`,
  прозрачная очередь) → курсор (`20`). Так муравьи всегда поверх грязи, курсор — поверх всего.

## Проверено
`godot --headless` загружает проект и прогоняет сотни кадров без ошибок; симуляция наполняется
(муравьи приходят плавно, крошки на столешнице, пятно как поле). GPU-визуал (кадрирование камеры,
шейдеры, цвета) headless не проверить — смотреть в редакторе.
