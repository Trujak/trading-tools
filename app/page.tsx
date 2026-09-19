'use client';

import { useEffect, useRef } from 'react';
import { createChart, CandlestickSeries, ColorType } from 'lightweight-charts';

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#111111' },
        textColor: '#DDD',
      },
      grid: {
        vertLines: { color: '#222' },
        horzLines: { color: '#222' },
      },
      width: containerRef.current.clientWidth,
      height: 500,
      timeScale: { timeVisible: true, secondsVisible: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // 1. Pobieramy dane historyczne (ostatnie 200 świec 1-minutowych)
    fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=200')
      .then((res) => res.json())
      .then((data) => {
        const candles = data.map((d: any) => ({
          time: d[0] / 1000,
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4]),
        }));
        candleSeries.setData(candles);
      });

    // 2. Podłączamy się na żywo do Binance (WebSocket)
    const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@kline_1m');

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const k = msg.k;
      candleSeries.update({
        time: k.t / 1000,
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
      });
    };

    // Sprzątanie przy zamknięciu strony
    return () => {
      ws.close();
      chart.remove();
    };
  }, []);

  return (
    <main style={{ padding: '20px' }}>
      <h1 style={{ color: 'white', fontFamily: 'sans-serif' }}>BTC/USDT — na żywo</h1>
      <div ref={containerRef} />
    </main>
  );
}