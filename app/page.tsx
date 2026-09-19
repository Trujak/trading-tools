'use client';

import { useEffect, useRef, useState } from 'react';
import { createChart, CandlestickSeries, ColorType, IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';

const PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
const INTERVALS = [
  { label: '1m', value: '1m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '4H', value: '4h' },
  { label: '1D', value: '1d' },
];

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1m');

  // Tworzymy wykres tylko raz
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#D1D4DC',
      },
      grid: {
        vertLines: { color: '#1e222d' },
        horzLines: { color: '#1e222d' },
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      timeScale: { timeVisible: true, secondsVisible: false },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    seriesRef.current = candleSeries;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Ładujemy dane i podłączamy WebSocket za każdym razem, gdy zmieni się para lub interwał
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    if (wsRef.current) {
      wsRef.current.close();
    }

    fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=300`)
      .then((res) => res.json())
      .then((data) => {
        const candles = data.map((d: any) => ({
          time: (d[0] / 1000) as UTCTimestamp,
          open: parseFloat(d[1]),
          high: parseFloat(d[2]),
          low: parseFloat(d[3]),
          close: parseFloat(d[4]),
        }));
        series.setData(candles);
        chartRef.current?.timeScale().fitContent();
      });

    const streamName = `${symbol.toLowerCase()}@kline_${interval}`;
    const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${streamName}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      const k = msg.k;
      series.update({
        time: (k.t / 1000) as UTCTimestamp,
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
      });
    };

    return () => {
      ws.close();
    };
  }, [symbol, interval]);

  return (
    <main className="h-screen w-screen bg-[#131722] flex flex-col overflow-hidden">
      {/* Górny pasek */}
      <header className="flex items-center gap-4 px-4 h-14 bg-[#1e222d] border-b border-[#2a2e39] shrink-0">
        <span className="text-white font-bold text-lg">📈 Trading Tools</span>

        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="bg-[#2a2e39] text-white px-3 py-1.5 rounded outline-none cursor-pointer"
        >
          {PAIRS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <div className="flex gap-1">
          {INTERVALS.map((i) => (
            <button
              key={i.value}
              onClick={() => setInterval(i.value)}
              className={`px-3 py-1.5 rounded text-sm ${
                interval === i.value
                  ? 'bg-[#2962ff] text-white'
                  : 'text-gray-400 hover:bg-[#2a2e39]'
              }`}
            >
              {i.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Boczna lista obserwowanych par */}
        <aside className="w-52 bg-[#1e222d] border-r border-[#2a2e39] shrink-0 overflow-y-auto">
          <div className="px-3 py-2 text-gray-500 text-xs uppercase">Obserwowane</div>
          {PAIRS.map((p) => (
            <button
              key={p}
              onClick={() => setSymbol(p)}
              className={`w-full text-left px-3 py-2 text-sm ${
                symbol === p ? 'bg-[#2a2e39] text-white' : 'text-gray-300 hover:bg-[#2a2e39]'
              }`}
            >
              {p}
            </button>
          ))}
        </aside>

        {/* Wykres */}
        <div className="flex-1 relative">
          <div ref={containerRef} className="absolute inset-0" />
        </div>
      </div>
    </main>
  );
}