-- Hyprland with Lua configuration. Include from your hyprland.lua with dofile(...).
hl.window_rule({
    name = "capri-overlay",
    match = { class = "^(capri)$", title = "^(Capri Overlay)$" },
    float = true,
    pin = true,
    no_initial_focus = true,
    no_blur = true,
    no_shadow = true,
    border_size = 0,
})

-- Optional: replace "capri" with the full executable/AppImage path if needed.
hl.bind("SUPER + SHIFT + C", hl.dsp.exec_cmd("capri --talk"))
hl.bind("SUPER + SHIFT + M", hl.dsp.exec_cmd("capri --memory"))
hl.bind("SUPER + SHIFT + W", hl.dsp.exec_cmd("capri --windows"))
hl.bind("SUPER + ALT + P", hl.dsp.exec_cmd("capri --projects"))
hl.bind("SUPER + ALT + R", hl.dsp.exec_cmd("capri --routines"))
hl.bind("SUPER + ALT + S", hl.dsp.exec_cmd("capri --settings"))
hl.bind("SUPER + ALT + SPACE", hl.dsp.exec_cmd("capri --palette"))
hl.bind("SUPER + ALT + V", hl.dsp.exec_cmd("capri --voice"))
hl.bind("SUPER + ALT + ESCAPE", hl.dsp.exec_cmd("capri --stop-control"))
-- To recover minimized windows even when Capri is closed:
hl.bind("SUPER + SHIFT + R", hl.dsp.workspace.toggle_special("capri-minimized"))
