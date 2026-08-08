# this is the code that sends the 8 button pressed info to the server through serial connection

from machine import Pin
import sys, time

button0 = Pin(6, Pin.IN, Pin.PULL_UP)
button1 = Pin(7, Pin.IN, Pin.PULL_UP)
button2 = Pin(8, Pin.IN, Pin.PULL_UP)
button3 = Pin(9, Pin.IN, Pin.PULL_UP)
button4 = Pin(10, Pin.IN, Pin.PULL_UP)
button5 = Pin(11, Pin.IN, Pin.PULL_UP)
button6 = Pin(12, Pin.IN, Pin.PULL_UP)
button7 = Pin(13, Pin.IN, Pin.PULL_UP)

buttons = [button0, button1, button2, button3, button4, button5, button6, button7]
last_state = [1, 1, 1, 1, 1, 1, 1, 1]  # one tracker per button

while True:
    for i, btn in enumerate(buttons):
        current = btn.value()
        if current != last_state[i]:
            time.sleep_ms(30)
            current = btn.value()
            if current != last_state[i]:
                last_state[i] = current
                pressed = 1 if current == 0 else 0
                print(f"{i}:{pressed}")
    time.sleep_ms(5)
