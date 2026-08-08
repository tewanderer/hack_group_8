import asyncio
import json
import serial
import websockets

# Update this to match your Pico's port
# Mac/Linux: something like '/dev/tty.usbmodem1101'
# Windows: something like 'COM5'
SERIAL_PORT = '/dev/tty.usbmodem1101'
BAUD_RATE = 9600

connected_clients = set()

async def handle_client(websocket):
    connected_clients.add(websocket)
    try:
        await websocket.wait_closed()
    finally:
        connected_clients.remove(websocket)

async def broadcast(message):
    if connected_clients:
        await asyncio.gather(*[ws.send(message) for ws in connected_clients])

async def read_serial():
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    loop = asyncio.get_running_loop()
    while True:
        line = await loop.run_in_executor(None, ser.readline)
        line = line.decode('utf-8').strip()
        if ':' in line:
            index, pressed = line.split(':')
            await broadcast(json.dumps({'index': int(index), 'pressed': pressed == '1'}))

async def main():
    async with websockets.serve(handle_client, 'localhost', 8080):
        print('Relay running on ws://localhost:8080')
        await read_serial()

asyncio.run(main())