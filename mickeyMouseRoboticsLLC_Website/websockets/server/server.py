import asyncio
import json
import threading
import queue
import serial
import websockets

SERIAL_PORT = "/dev/tty.usbmodem1101"  # update this if your port name changes
SERIAL_BAUD = 115200

message_queue = queue.Queue()
connected_clients = set()


def serial_reader(port_name):
    ser = serial.Serial(port_name, SERIAL_BAUD, timeout=1)
    print(f"Listening on {port_name}")
    while True:
        try:
            line = ser.readline().decode("utf-8").strip()
            if line:
                print(f"Received: {line}")
                message_queue.put(line)
        except Exception as e:
            print("Serial read error:", e)


async def register(websocket):
    connected_clients.add(websocket)
    print("Client connected:", websocket.remote_address)
    try:
        async for _ in websocket:
            pass  # we don't need to receive anything from the client
    finally:
        connected_clients.discard(websocket)
        print("Client disconnected")


async def broadcast(data: dict):
    if not connected_clients:
        return
    message = json.dumps(data)
    await asyncio.gather(
        *(ws.send(message) for ws in connected_clients),
        return_exceptions=True
    )


async def queue_watcher():
    loop = asyncio.get_running_loop()
    while True:
        line = await loop.run_in_executor(None, message_queue.get)
        await broadcast({"pressed": line == "PRESSED"})


async def main():
    threading.Thread(target=serial_reader, args=(SERIAL_PORT,), daemon=True).start()

    async with websockets.serve(register, "localhost", 8765):
        print("WebSocket server running on ws://localhost:8765")
        await queue_watcher()


if __name__ == "__main__":
    asyncio.run(main())