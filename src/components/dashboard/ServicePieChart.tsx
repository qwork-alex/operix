import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const data = [
  { name: "Completed", value: 847, color: "hsl(152, 60%, 45%)" },
  { name: "In Progress", value: 234, color: "hsl(43, 85%, 55%)" },
  { name: "Pending", value: 156, color: "hsl(210, 80%, 55%)" },
  { name: "Cancelled", value: 42, color: "hsl(0, 72%, 55%)" },
];

export function ServicePieChart() {
  return (
    <div className="glass-panel rounded-xl p-5 animate-fade-in">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">Service Status</h3>
        <p className="text-xs text-muted-foreground">Current distribution</p>
      </div>
      <div className="flex items-center gap-4">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={72}
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "hsl(220, 14%, 11%)",
                border: "1px solid hsl(220, 12%, 18%)",
                borderRadius: "8px",
                fontSize: 12,
                color: "hsl(40, 10%, 92%)",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-2.5">
          {data.map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
              <span className="text-xs text-muted-foreground">{item.name}</span>
              <span className="text-xs font-semibold text-foreground ml-auto">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
