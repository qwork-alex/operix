import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

const data = [
  { month: "Jan", revenue: 42000, expenses: 28000 },
  { month: "Feb", revenue: 48000, expenses: 30000 },
  { month: "Mar", revenue: 45000, expenses: 27000 },
  { month: "Apr", revenue: 56000, expenses: 32000 },
  { month: "May", revenue: 62000, expenses: 35000 },
  { month: "Jun", revenue: 58000, expenses: 33000 },
  { month: "Jul", revenue: 67000, expenses: 36000 },
  { month: "Aug", revenue: 72000, expenses: 38000 },
  { month: "Sep", revenue: 69000, expenses: 37000 },
  { month: "Oct", revenue: 78000, expenses: 40000 },
  { month: "Nov", revenue: 82000, expenses: 42000 },
  { month: "Dec", revenue: 88000, expenses: 44000 },
];

export function RevenueChart() {
  return (
    <div className="glass-panel rounded-xl p-5 animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Revenue Overview</h3>
          <p className="text-xs text-muted-foreground">Monthly revenue vs expenses</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-muted-foreground">Revenue</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-accent" />
            <span className="text-muted-foreground">Expenses</span>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(43, 85%, 55%)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="hsl(43, 85%, 55%)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(210, 80%, 55%)" stopOpacity={0.15} />
              <stop offset="100%" stopColor="hsl(210, 80%, 55%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 12%, 18%)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: "hsl(220, 10%, 50%)", fontSize: 11 }}
            axisLine={{ stroke: "hsl(220, 12%, 18%)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "hsl(220, 10%, 50%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `€${v / 1000}k`}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(220, 14%, 11%)",
              border: "1px solid hsl(220, 12%, 18%)",
              borderRadius: "8px",
              fontSize: 12,
              color: "hsl(40, 10%, 92%)",
            }}
            formatter={(value: number) => [`€${value.toLocaleString()}`, ""]}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="hsl(43, 85%, 55%)"
            strokeWidth={2}
            fill="url(#goldGrad)"
          />
          <Area
            type="monotone"
            dataKey="expenses"
            stroke="hsl(210, 80%, 55%)"
            strokeWidth={2}
            fill="url(#blueGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
