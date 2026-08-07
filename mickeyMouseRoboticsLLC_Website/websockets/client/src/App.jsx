import { useState, useEffect } from "react";

function ButtonStatus() {
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8765");
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setPressed(data.pressed);
    };
    ws.onopen = () => console.log("Connected to server.py");
    ws.onerror = (err) => console.error("WebSocket error:", err);
    return () => ws.close();
  }, []);

  return <p>Button is {pressed ? "PRESSED 🔴" : "released ⚪"}</p>;
}

export default ButtonStatus;