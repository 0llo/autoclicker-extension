import os
from PIL import Image, ImageDraw

def create_cursor(size):
    # Base grid is 16x16
    # 0 = transparent, 1 = black border, 2 = white fill, 3 = red/pink click effect
    grid = [
        "0000000000000000",
        "0110000000000000",
        "0121000000000000",
        "0122100000000000",
        "0122210000000000",
        "0122221000000000",
        "0122222100000000",
        "0122222210000000",
        "0122222221000000",
        "0122222222100000",
        "0122222111110000",
        "0122211030300000",
        "0121121003000000",
        "0110121030300000",
        "0100012100000000",
        "0000001100000000"
    ]
    
    img = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    pixels = img.load()
    
    colors = {
        '0': (0, 0, 0, 0),
        '1': (40, 44, 52, 255),       # Dark slate gray border
        '2': (255, 255, 255, 255),    # White inner
        '3': (255, 87, 34, 255)       # Orange click effect
    }
    
    for y in range(16):
        for x in range(16):
            pixels[x, y] = colors[grid[y][x]]
            
    # Resize the image without interpolation (Nearest Neighbor) to keep pixel art look
    img = img.resize((size, size), Image.Resampling.NEAREST)
    return img

os.makedirs('icons', exist_ok=True)
create_cursor(16).save('icons/icon16.png')
create_cursor(48).save('icons/icon48.png')
create_cursor(128).save('icons/icon128.png')
print("Icons generated successfully.")
