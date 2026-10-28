# G01 One inbox - director's brief

Glass Studio register, tiny-shoot format, feature: the Snap inbox (lead.created). See growth/motion/INSTAGRAM.md.

The photographer stands at a giant frosted glass envelope in the lavender studio.
Across from her, a tiny engaged couple, Priya and Sam, have just found her and wave hello.
As she lowers her camera and smiles, a few small glass cards lift out of the envelope and float up into the light: their inquiry, landing in one place.
The Snap inbox card drops in: "New inquiry - Priya & Sam", "Wedding inquiry".

Opens on the poster tile ("Every inquiry in *one* inbox."), the same object as the inbox poster on the grid, then the moment, then the phone.
Feels calm, light and a little magical. Nothing is chased; it just arrives.

## Production

- Keyframe: Z-Image Turbo, 768x1344, seed 3123, prompt `keyframe.prompt.txt` (sheets: glassStudio, photographer, priyaSam).
- Clip: `hybrid/wan.mjs`, seed 11, prompt `motion.prompt.txt`; draft 480x832, kept 720x1280. Static camera so the clip can be lifted 200 px clear of the cover pill.
- Frames: minterpolate to 30 fps, lanczos to 1080x1920, into `out/G01/frames/`.
