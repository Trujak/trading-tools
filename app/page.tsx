'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  ColorType,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from 'lightweight-charts';

const PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT',
  'DOGEUSDT', 'TRXUSDT', 'TONUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
  'LTCUSDT', 'BCHUSDT', 'NEARUSDT', 'ATOMUSDT', 'UNIUSDT', 'ETCUSDT',
  'APTUSDT', 'ARBUSDT', 'OPUSDT', 'FILUSDT', 'INJUSDT', 'SUIUSDT',
  'PEPEUSDT', 'SHIBUSDT',
];

const INTERVALS = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '30m', value: '30m' },
  { label: '1H', value: '1h' },
  { label: '2H', value: '2h' },
  { label: '4H', value: '4h' },
  { label: '12H', value: '12h' },
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
  { label: '1M', value: '1M' },
];

type DrawMode = 'cursor' | 'trendline';

export default function Home() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const drawingsRef = useRef<ISeriesApi<'Line'>[]>([]);
  const pendingPointRef = useRef<{ time: UTCTimestamp; price: number } | null>(null);
  const drawModeRef = useRef<DrawMode>('cursor');

  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState('1d');
  const [search, setSearch] = useState('');
  const [drawMode, setDrawMode] = useState<DrawMode>('cursor');

  useEffect(() => {
    drawModeRef.current = drawMode;
  }, [drawMode]);

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

    // Obsługa kliknięć - rysowanie linii trendu
    chart.subscribeClick((param) => {
      if (drawModeRef.current !== 'trendline') return;
      if (!param.point || param.time === undefined) return;

      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price === null) return;

      const clickedTime = param.time as UTCTimestamp;

      if (!pendingPointRef.current) {
        pendingPointRef.current = { time: clickedTime, price };
      } else {
        const start = pendingPointRef.current;
        const lineSeries = chart.addSeries(LineSeries, {
          color: '#2962ff',
          lineWidth: 2,
        });
        lineSeries.setData([
          { time: start.time, value: start.price },
          { time: clickedTime, value: price },
        ]);
        drawingsRef.current.push(lineSeries);
        pendingPointRef.current = null;
      }
    });

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

    // 1000 to maksymalna liczba świec, jaką pozwala pobrać jednorazowo Binance
    fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=1000`)
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

  const clearDrawings = () => {
    drawingsRef.current.forEach((line) => chartRef.current?.removeSeries(line));
    drawingsRef.current = [];
    pendingPointRef.current = null;
  };

  const filteredPairs = PAIRS.filter((p) => p.includes(search.toUpperCase()));

  return (
    <main className="h-screen w-screen bg-[#131722] flex flex-col overflow-hidden">
      {/* Górny pasek */}
      <header className="flex items-center gap-4 px-4 h-14 bg-[#1e222d] border-b border-[#2a2e39] shrink-0">
        <span className="text-white font-bold text-lg">📈 Trading Tools</span>
        <span className="text-gray-400 text-sm">{symbol}</span>

        <div className="flex flex-wrap gap-1">
          {INTERVALS.map((i) => (
            <button
              key={i.value}
              onClick={() => setInterval(i.value)}
              className={`px-2.5 py-1.5 rounded text-sm ${
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
        {/* Pionowy pasek narzędzi do rysowania */}
        <aside className="w-12 bg-[#1e222d] border-r border-[#2a2e39] shrink-0 flex flex-col items-center py-2 gap-1">
          <button
            onClick={() => {
              setDrawMode('cursor');
              pendingPointRef.current = null;
            }}
            title="Kursor"
            className={`w-9 h-9 rounded flex items-center justify-center text-lg ${
              drawMode === 'cursor' ? 'bg-[#2962ff]' : 'hover:bg-[#2a2e39]'
            }`}
          >
            🖱️
          </button>
          <button
            onClick={() => setDrawMode('trendline')}
            title="Linia trendu"
            className={`w-9 h-9 rounded flex items-center justify-center text-lg ${
              drawMode === 'trendline' ? 'bg-[#2962ff]' : 'hover:bg-[#2a2e39]'
            }`}
          >
            📈
          </button>
          <button
            onClick={clearDrawings}
            title="Wyczyść rysunki"
            className="w-9 h-9 rounded flex items-center justify-center text-lg hover:bg-[#2a2e39]"
          >
            🗑️
          </button>
        </aside>

        {/* Boczna lista par z wyszukiwarką */}
        <aside className="w-52 bg-[#1e222d] border-r border-[#2a2e39] shrink-0 flex flex-col overflow-hidden">
          <div className="p-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Szukaj pary..."
              className="w-full bg-[#2a2e39] text-white text-sm px-2 py-1.5 rounded outline-none"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredPairs.map((p) => (
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
          </div>
        </aside>

        {/* Wykres */}
        <div className="flex-1 relative">
          <div ref={containerRef} className="absolute inset-0" />
        </div>
      </div>
    </main>
  );
}