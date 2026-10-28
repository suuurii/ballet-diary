import type { EChartsOption } from 'echarts'
import type { Category } from '../db'
import type { CategoryTotal } from './stats'

function monthLabels(months: string[]): string[] {
  const years = new Set(months.map((m) => m.slice(0, 4)))
  const sameYear = years.size === 1
  return months.map((m) => {
    const [y, mm] = m.split('-')
    return sameYear ? `${Number(mm)}月` : `${y.slice(2)}/${mm}`
  })
}

export function calendarHeatmapOption(days: Map<string, number>, year: number): EChartsOption {
  const data = [...days.entries()]
    .filter(([d]) => d.startsWith(String(year)))
    .map(([d, v]) => [d, Math.round(v)] as [string, number])
  const max = Math.max(1, ...data.map(([, v]) => v))
  return {
    tooltip: {
      formatter: (p: any) => `${p.value[0]}<br/><b>${p.value[1]}</b> 分钟`,
    },
    visualMap: {
      min: 0,
      max,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: { color: ['#f6ebed', '#ecc9d0', '#d69aa5', '#b76e79'] },
      textStyle: { color: '#9a8a90' },
    },
    calendar: {
      top: 24,
      left: 32,
      right: 20,
      bottom: 56,
      range: String(year),
      cellSize: ['auto', 15],
      splitLine: { lineStyle: { color: '#eee' } },
      itemStyle: { color: '#fff', borderWidth: 2, borderColor: '#faf5f7' },
      dayLabel: { nameMap: 'cn', color: '#9a8a90', firstDay: 1, fontSize: 10 },
      monthLabel: { nameMap: 'cn', color: '#9a8a90', fontSize: 11 },
      yearLabel: { show: false },
    },
    series: [
      {
        type: 'heatmap',
        coordinateSystem: 'calendar',
        data,
      },
    ],
  }
}

export function monthlyStackedOption(
  months: string[],
  categories: Category[],
  byMonthCat: Map<string, Map<number | null, number>>,
): EChartsOption {
  const series: any[] = categories.map((c) => ({
    name: c.name,
    type: 'bar',
    stack: 'total',
    emphasis: { focus: 'series' },
    itemStyle: { color: c.color },
    data: months.map((m) => Math.round(byMonthCat.get(m)?.get(c.id!) || 0)),
  }))
  const hasNull = months.some((m) => (byMonthCat.get(m)?.get(null) || 0) > 0)
  if (hasNull) {
    series.push({
      name: '未分类',
      type: 'bar',
      stack: 'total',
      emphasis: { focus: 'series' },
      itemStyle: { color: '#bdbdbd' },
      data: months.map((m) => Math.round(byMonthCat.get(m)?.get(null) || 0)),
    })
  }
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: any) => `${Math.round(v)} 分钟`,
    },
    legend: { top: 0, type: 'scroll', textStyle: { color: '#9a8a90', fontSize: 11 } },
    grid: { left: 8, right: 12, top: 44, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      data: monthLabels(months),
      axisLabel: { color: '#9a8a90' },
      axisLine: { lineStyle: { color: '#eee' } },
    },
    yAxis: {
      type: 'value',
      name: '分钟',
      nameTextStyle: { color: '#9a8a90' },
      splitLine: { lineStyle: { color: '#f3f3f3' } },
      axisLabel: { color: '#9a8a90' },
    },
    series,
  }
}

export function donutOption(totals: CategoryTotal[]): EChartsOption {
  return {
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => `${p.name}: ${Math.round(p.value)} 分钟 (${p.percent}%)`,
    },
    legend: {
      bottom: 0,
      type: 'scroll',
      textStyle: { color: '#9a8a90', fontSize: 11 },
    },
    series: [
      {
        type: 'pie',
        radius: ['46%', '72%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#fff', borderWidth: 2 },
        label: { show: false },
        emphasis: { label: { show: true, fontWeight: 'bold', fontSize: 14 } },
        data: totals.map((t) => ({
          name: t.name,
          value: Math.round(t.minutes),
          itemStyle: { color: t.color },
        })),
      },
    ],
  }
}

export function trendLineOption(weeks: string[], values: number[]): EChartsOption {
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
  return {
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: any) => `${Math.round(v)} 分钟`,
    },
    grid: { left: 8, right: 12, top: 16, bottom: 4, containLabel: true },
    xAxis: {
      type: 'category',
      data: weeks.map((w) => w.slice(5)),
      boundaryGap: false,
      axisLabel: { color: '#9a8a90' },
      axisLine: { lineStyle: { color: '#eee' } },
    },
    yAxis: {
      type: 'value',
      name: '分钟',
      nameTextStyle: { color: '#9a8a90' },
      splitLine: { lineStyle: { color: '#f3f3f3' } },
      axisLabel: { color: '#9a8a90' },
    },
    series: [
      {
        name: '周总时长',
        type: 'line',
        smooth: true,
        symbolSize: 6,
        data: values.map((v) => Math.round(v)),
        itemStyle: { color: '#b76e79' },
        lineStyle: { width: 2.5 },
        areaStyle: { color: 'rgba(183,110,121,0.10)' },
      },
      {
        name: '周均值',
        type: 'line',
        data: values.map(() => Math.round(avg)),
        lineStyle: { type: 'dashed', color: '#9e9e9e' },
        symbol: 'none',
        silent: true,
      },
    ],
  }
}
