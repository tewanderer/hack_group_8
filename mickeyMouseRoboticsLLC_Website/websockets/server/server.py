import asyncio
import json
import serial
import websockets

# Update this to match your Pico's port
# Mac/Linux: something like '/dev/tty.usbmodem1101'
# Windows: something like 'COM5'
SERIAL_PORT = '/dev/tty.usbmodem1101'
# USB CDC serial (which is what the Pico exposes) ignores the requested
# baud rate at the hardware level, but pyserial still wants a value -- keep
# this in sync with whatever you use for a REPL/Thonny connection.
BAUD_RATE = 115200

connected_clients = set()


async def handle_client(websocket):
    connected_clients.add(websocket)
    try:
        await websocket.wait_closed()
    finally:
        connected_clients.discard(websocket)


async def broadcast(message):
    if connected_clients:
        await asyncio.gather(
            *[ws.send(message) for ws in connected_clients],
            return_exceptions=True,
        )


async def read_serial():
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    loop = asyncio.get_running_loop()
    while True:
        raw = await loop.run_in_executor(None, ser.readline)
        if not raw:
            continue

        try:
            line = raw.decode('utf-8').strip()
        except UnicodeDecodeError:
            continue

        if not line:
            continue

        # The Pico now sends one JSON object per line already
        # ({"type":"note",...} or {"type":"state",...}), so the relay's
        # only job is to validate and forward it -- no reparsing needed.
        try:
            data = json.loads(line)
        except ValueError:
            print(f"Skipping malformed line: {line!r}")
            continue

        await broadcast(json.dumps(data))


async def main():
    async with websockets.serve(handle_client, 'localhost', 8080):
        print('Relay running on ws://localhost:8080')
        await read_serial()

asyncio.run(main())