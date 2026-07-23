import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Button } from "../ui/button";
import {
  Download,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  Calendar,
  ChevronDown,
  FileSpreadsheet,
  Banknote,
  TrendingDown,
  Activity,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Badge } from "../ui/badge";
import { toast } from "sonner@2.0.3";
import { AttendanceSheetGenerator } from "../attendance-sheet-generator";

interface AnalyticsPageProps {
  attendanceData: Record<
    string,
    "present" | "absent" | "holiday" | "late"
  >;
}

export function AnalyticsPage({
  attendanceData,
}: AnalyticsPageProps) {
  const [selectedPeriod, setSelectedPeriod] =
    useState("thisMonth");
  const [selectedChart, setSelectedChart] = useState("bar");
  
  // Collapsible card states
  const [isAttendanceSheetOpen, setIsAttendanceSheetOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);

  // July 2026 weekly breakdown (weeks ending Jul 21)
  // Week 1: Jul 1–3 (3 days), Week 2: Jul 6–10 (5 days), Week 3: Jul 13–17 (5 days), Week 4 (partial): Jul 20–21 (2 days)
  const generateWeeklyData = () => [
    { week: "Week 1", present: 3, absent: 0, late: 0 },
    { week: "Week 2", present: 4, absent: 0, late: 1 },
    { week: "Week 3", present: 3, absent: 1, late: 0 },
    { week: "Week 4", present: 1, absent: 0, late: 1 },
  ];

  // Monthly attendance data Jan–Jul 2026 (working days only, holidays excluded)
  const generateMonthlyData = () => [
    { month: "Jan", present: 18, absent: 1, late: 2 },
    { month: "Feb", present: 17, absent: 1, late: 2 },
    { month: "Mar", present: 19, absent: 1, late: 2 },
    { month: "Apr", present: 17, absent: 2, late: 1 },
    { month: "May", present: 19, absent: 1, late: 2 },
    { month: "Jun", present: 17, absent: 1, late: 2 },
    { month: "Jul", present: 11, absent: 1, late: 2 },
  ];

  // Calculate current month statistics
  const calculateMonthlyStats = () => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const stats = Object.entries(attendanceData).reduce(
      (acc, [date, status]) => {
        const entryDate = new Date(date);
        if (
          entryDate.getMonth() === currentMonth &&
          entryDate.getFullYear() === currentYear
        ) {
          acc[status] = (acc[status] || 0) + 1;
        }
        return acc;
      },
      {} as Record<string, number>,
    );

    const total = Object.values(stats).reduce(
      (sum, count) => sum + count,
      0,
    );

    return [
      {
        name: "Present",
        value: stats.present || 0,
        color: "oklch(0.7 0.15 145)",
      },
      {
        name: "Late",
        value: stats.late || 0,
        color: "oklch(0.7 0.15 50)",
      },
      {
        name: "Absent",
        value: stats.absent || 0,
        color: "oklch(0.396 0.141 25.723)",
      },
      {
        name: "Holiday",
        value: stats.holiday || 0,
        color: "oklch(0.6 0.2 300)",
      },
    ].filter((item) => item.value > 0);
  };

  const weeklyData = generateWeeklyData();
  const monthlyData = generateMonthlyData();
  const pieData = calculateMonthlyStats();

  const getChartData = () => {
    switch (selectedPeriod) {
      case "thisMonth":
      case "lastMonth":
        return weeklyData;
      case "last6Months":
      case "thisYear":
        return monthlyData;
      default:
        return weeklyData;
    }
  };

  const chartData = getChartData();
  const totalPresent =
    pieData.find((item) => item.name === "Present")?.value || 0;
  const totalDays = pieData.reduce(
    (sum, item) => sum + item.value,
    0,
  );
  const attendanceRate =
    totalDays > 0
      ? Math.round((totalPresent / totalDays) * 100)
      : 0;

  const exportAnalyticsToCSV = () => {
    const periodLabel = selectedPeriod === "thisMonth" 
      ? "This Month" 
      : selectedPeriod === "lastMonth" 
      ? "Last Month" 
      : selectedPeriod === "last6Months" 
      ? "Last 6 Months" 
      : "This Year";

    const currentDate = new Date();
    const dateStr = currentDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const csvContent = [
      `Analytics & Reports`,
      `Generated on: ${dateStr}`,
      `Period: ${periodLabel}`,
      ``,
      `Summary Metrics:`,
      `Attendance Rate,${attendanceRate}%`,
      `Days Present,${totalPresent}`,
      `Total Days,${totalDays}`,
      ``,
      `Attendance Trends:`,
      selectedPeriod.includes("Month") ? "Week,Present,Late,Absent" : "Month,Present,Late,Absent",
      ...chartData.map((row) => 
        `${row.week || row.month},${row.present},${row.late},${row.absent}`
      ),
      ``,
      `Status Distribution:`,
      `Status,Count`,
      ...pieData.map((item) => `${item.name},${item.value}`)
    ].join("\n");

    // Add UTF-8 BOM to ensure proper encoding
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `analytics-report-${new Date().toISOString().split('T')[0]}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success("CSV report exported successfully");
  };

  const exportAnalyticsToPDF = () => {
    const periodLabel = selectedPeriod === "thisMonth" 
      ? "This Month" 
      : selectedPeriod === "lastMonth" 
      ? "Last Month" 
      : selectedPeriod === "last6Months" 
      ? "Last 6 Months" 
      : "This Year";

    const currentDate = new Date();
    const dateStr = currentDate.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Analytics Report</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              padding: 30px; 
              background: white;
            }
            .header { 
              margin-bottom: 30px; 
              border-bottom: 3px solid #3b82f6; 
              padding-bottom: 15px; 
            }
            h1 { 
              color: #1e293b; 
              margin: 0 0 10px 0; 
              font-size: 32px; 
            }
            .meta { 
              color: #64748b; 
              font-size: 14px; 
              line-height: 1.6; 
            }
            .metrics { 
              margin: 30px 0; 
              padding: 25px; 
              background: #f8fafc; 
              border-radius: 12px; 
              border: 1px solid #e2e8f0;
            }
            .metrics h2 {
              margin: 0 0 20px 0;
              color: #1e293b;
              font-size: 20px;
            }
            .metrics-grid { 
              display: grid; 
              grid-template-columns: repeat(3, 1fr); 
              gap: 20px; 
            }
            .metric-card { 
              text-align: center; 
              padding: 20px; 
              background: white; 
              border-radius: 8px; 
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .metric-card .value { 
              font-size: 36px; 
              font-weight: bold; 
              margin-bottom: 8px;
            }
            .metric-card .label { 
              font-size: 13px; 
              color: #64748b; 
            }
            .green { color: #22c55e; }
            .blue { color: #3b82f6; }
            .purple { color: #a855f7; }
            
            table { 
              width: 100%; 
              border-collapse: collapse; 
              font-size: 13px; 
              margin: 30px 0;
              background: white;
            }
            table caption {
              font-size: 18px;
              font-weight: bold;
              color: #1e293b;
              text-align: left;
              margin-bottom: 15px;
            }
            th { 
              background: #1e293b; 
              color: white; 
              padding: 14px 12px; 
              text-align: left; 
              font-size: 12px;
              font-weight: 600;
            }
            td { 
              padding: 12px; 
              border-bottom: 1px solid #e2e8f0; 
            }
            tr:nth-child(even) { 
              background: #f8fafc; 
            }
            tr:hover {
              background: #f1f5f9;
            }
            .status-table {
              max-width: 400px;
            }
            .footer { 
              margin-top: 40px; 
              padding-top: 20px;
              border-top: 2px solid #e2e8f0;
              color: #64748b; 
              font-size: 12px; 
              text-align: center; 
            }
            @media print {
              body { padding: 20px; }
              .metric-card { box-shadow: none; border: 1px solid #e2e8f0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Analytics & Reports</h1>
            <div class="meta">
              <strong>Period:</strong> ${periodLabel}<br>
              <strong>Generated:</strong> ${dateStr}
            </div>
          </div>
          
          <div class="metrics">
            <h2>Key Metrics</h2>
            <div class="metrics-grid">
              <div class="metric-card">
                <div class="value green">${attendanceRate}%</div>
                <div class="label">Attendance Rate</div>
              </div>
              <div class="metric-card">
                <div class="value blue">${totalPresent}</div>
                <div class="label">Days Present</div>
              </div>
              <div class="metric-card">
                <div class="value purple">${totalDays}</div>
                <div class="label">Total Days</div>
              </div>
            </div>
          </div>
          
          <table>
            <caption>Attendance Trends</caption>
            <thead>
              <tr>
                <th>${selectedPeriod.includes("Month") ? "Week" : "Month"}</th>
                <th>Present</th>
                <th>Late</th>
                <th>Absent</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${chartData.map((row) => `
                <tr>
                  <td><strong>${row.week || row.month}</strong></td>
                  <td style="color: #22c55e;">${row.present}</td>
                  <td style="color: #f59e0b;">${row.late}</td>
                  <td style="color: #ef4444;">${row.absent}</td>
                  <td><strong>${row.present + row.late + row.absent}</strong></td>
                </tr>
              `).join("")}
            </tbody>
          </table>

          ${pieData.length > 0 ? `
          <table class="status-table">
            <caption>Status Distribution</caption>
            <thead>
              <tr>
                <th>Status</th>
                <th>Count</th>
                <th>Percentage</th>
              </tr>
            </thead>
            <tbody>
              ${pieData.map((item) => {
                const percentage = totalDays > 0 ? Math.round((item.value / totalDays) * 100) : 0;
                return `
                <tr>
                  <td><strong>${item.name}</strong></td>
                  <td>${item.value}</td>
                  <td>${percentage}%</td>
                </tr>
              `}).join("")}
            </tbody>
          </table>
          ` : ""}
          
          <div class="footer">
            This is an automatically generated analytics report from the Attendance Tracker System.
          </div>
        </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const newWindow = window.open(url, "_blank");

    if (newWindow) {
      newWindow.onload = () => {
        setTimeout(() => {
          newWindow.print();
        }, 250);
      };
      toast.success("PDF report opened in new window");
    } else {
      toast.error("Please allow popups to export PDF");
    }
  };

  const handleExportData = (format: "pdf" | "csv") => {
    if (format === "csv") {
      exportAnalyticsToCSV();
    } else {
      exportAnalyticsToPDF();
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="px-4 space-y-4">
        {/* Attendance Sheet and Payroll - Collapsible */}
        <Card>
          <CardHeader 
            className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setIsAttendanceSheetOpen(!isAttendanceSheetOpen)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-vibrant-green" />
                Attendance Sheet and Payroll
              </CardTitle>
              <motion.div
                animate={{ rotate: isAttendanceSheetOpen ? 180 : 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsAttendanceSheetOpen(!isAttendanceSheetOpen);
                  }}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </motion.div>
            </div>
          </CardHeader>
          <AnimatePresence initial={false}>
            {isAttendanceSheetOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ 
                  height: "auto", 
                  opacity: 1,
                  transition: {
                    height: {
                      duration: 0.4,
                      ease: [0.4, 0, 0.2, 1]
                    },
                    opacity: {
                      duration: 0.3,
                      delay: 0.1,
                      ease: "easeOut"
                    }
                  }
                }}
                exit={{ 
                  height: 0, 
                  opacity: 0,
                  transition: {
                    height: {
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1]
                    },
                    opacity: {
                      duration: 0.2,
                      ease: "easeIn"
                    }
                  }
                }}
                style={{ overflow: "hidden" }}
              >
                <CardContent className="pt-0">
                  <AttendanceSheetGenerator />
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* Merged Analytics & Reports - Collapsible */}
        <Card>
          <CardHeader 
            className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setIsAnalyticsOpen(!isAnalyticsOpen)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-vibrant-blue" />
                Analytics & Reports
              </CardTitle>
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ rotate: isAnalyticsOpen ? 180 : 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsAnalyticsOpen(!isAnalyticsOpen);
                    }}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </motion.div>
              </div>
            </div>
          </CardHeader>
          <AnimatePresence initial={false}>
            {isAnalyticsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ 
                  height: "auto", 
                  opacity: 1,
                  transition: {
                    height: {
                      duration: 0.4,
                      ease: [0.4, 0, 0.2, 1]
                    },
                    opacity: {
                      duration: 0.3,
                      delay: 0.1,
                      ease: "easeOut"
                    }
                  }
                }}
                exit={{ 
                  height: 0, 
                  opacity: 0,
                  transition: {
                    height: {
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1]
                    },
                    opacity: {
                      duration: 0.2,
                      ease: "easeIn"
                    }
                  }
                }}
                style={{ overflow: "hidden" }}
              >
                <CardContent className="space-y-4 pt-0">
                  {/* Export Buttons */}
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExportData("csv")}
                      className="flex-1 sm:flex-none"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      CSV
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExportData("pdf")}
                      className="flex-1 sm:flex-none"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                  </div>

                  {/* Filters */}
                  <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Time Period
                </label>
                <Select
                  value={selectedPeriod}
                  onValueChange={setSelectedPeriod}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="thisMonth">
                      This Month
                    </SelectItem>
                    <SelectItem value="lastMonth">
                      Last Month
                    </SelectItem>
                    <SelectItem value="last6Months">
                      Last 6 Months
                    </SelectItem>
                    <SelectItem value="thisYear">
                      This Year
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Chart Type
                </label>
                <Select
                  value={selectedChart}
                  onValueChange={setSelectedChart}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bar">
                      Bar Chart
                    </SelectItem>
                    <SelectItem value="line">
                      Line Chart
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
                  </div>

                  {/* Key Metrics */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp className="h-5 w-5 text-vibrant-green" />
                      <h3 className="font-medium">Key Metrics</h3>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-lg bg-vibrant-green/10">
              <p className="text-2xl font-bold text-vibrant-green">
                {attendanceRate}%
              </p>
              <p className="text-sm text-muted-foreground">
                Attendance Rate
              </p>
            </div>
            <div className="text-center p-4 rounded-lg bg-vibrant-blue/10">
              <p className="text-2xl font-bold text-vibrant-blue">
                {totalPresent}
              </p>
              <p className="text-sm text-muted-foreground">
                Days Present
              </p>
            </div>
            <div className="text-center p-4 rounded-lg bg-vibrant-purple/10">
              <p className="text-2xl font-bold text-vibrant-purple">
                {totalDays}
              </p>
              <p className="text-sm text-muted-foreground">
                Total Days
              </p>
                    </div>
                  </div>
                  </div>

                  {/* Attendance Trends */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <BarChart3 className="h-5 w-5 text-vibrant-blue" />
                      <h3 className="font-medium">Attendance Trends</h3>
                    </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                {selectedChart === "bar" ? (
                  <BarChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="opacity-30"
                    />
                    <XAxis
                      dataKey={
                        selectedPeriod.includes("Month")
                          ? "week"
                          : "month"
                      }
                      fontSize={12}
                    />
                    <YAxis fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Bar
                      dataKey="present"
                      fill="oklch(0.7 0.15 145)"
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      dataKey="late"
                      fill="oklch(0.7 0.15 50)"
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      dataKey="absent"
                      fill="oklch(0.396 0.141 25.723)"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                ) : (
                  <LineChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="opacity-30"
                    />
                    <XAxis
                      dataKey={
                        selectedPeriod.includes("Month")
                          ? "week"
                          : "month"
                      }
                      fontSize={12}
                    />
                    <YAxis fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="present"
                      stroke="oklch(0.7 0.15 145)"
                      strokeWidth={3}
                      dot={{
                        fill: "oklch(0.7 0.15 145)",
                        strokeWidth: 2,
                        r: 4,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="late"
                      stroke="oklch(0.7 0.15 50)"
                      strokeWidth={3}
                      dot={{
                        fill: "oklch(0.7 0.15 50)",
                        strokeWidth: 2,
                        r: 4,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="absent"
                      stroke="oklch(0.396 0.141 25.723)"
                      strokeWidth={3}
                      dot={{
                        fill: "oklch(0.396 0.141 25.723)",
                        strokeWidth: 2,
                        r: 4,
                      }}
                    />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>

            <div className="flex justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded"
                  style={{
                    backgroundColor: "oklch(0.7 0.15 145)",
                  }}
                />
                <span className="text-sm text-muted-foreground">
                  Present
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded"
                  style={{
                    backgroundColor: "oklch(0.7 0.15 50)",
                  }}
                />
                <span className="text-sm text-muted-foreground">
                  Late
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded"
                  style={{
                    backgroundColor:
                      "oklch(0.396 0.141 25.723)",
                  }}
                />
                <span className="text-sm text-muted-foreground">
                  Absent
                </span>
              </div>
            </div>
                  </div>
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>


      </div>
    </div>
  );
}
