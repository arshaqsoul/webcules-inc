from PIL import Image
import glob, os
files = sorted(glob.glob(r'C:\\Users\\arsha\\Documents\\projects\\webcules\\webcules-inc\\apps\\landing\\.forge-record\\wildcode-field\f-*.png'))
ims = [Image.open(f).convert('RGB') for f in files]
if not ims: raise SystemExit('no frames')
ims[0].save(r'C:\\Users\\arsha\\Documents\\projects\\webcules\\webcules-inc\\apps\\landing\\public\\components\\wildcode-field.webp', save_all=True, append_images=ims[1:], duration=83, loop=0, quality=82, method=6)
print('webp frames:', len(ims))