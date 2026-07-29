import { useMemo, useState } from "react";
import { Clock, LogIn, Coffee, PlayCircle, LogOut, AlertCircle, PauseCircle } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

interface AttendanceStatusProps {
  isClockedIn: boolean;
  clockInTime?: string;
  workingHours: string;
  currentWorkDurationMinutes: number;
  lateMinutes: number;
  activityLogs: Array<{
    activityId: number;
    action: string;
    loggedAt: string;
  }>;
  onClockIn: () => void;
  onClockOut: () => void;
  onBreak: () => void;
  isOnBreak?: boolean;
}

export function AttendanceStatus({
  isClockedIn,
  clockInTime,
  workingHours,
  currentWorkDurationMinutes,
  lateMinutes,
  activityLogs,
  onClockIn,
  onClockOut,
  onBreak,
  isOnBreak = false,
}: AttendanceStatusProps) {
  const [showClockoutDialog, setShowClockoutDialog] = useState(false);

  const handleClockoutClick = () => {
    setShowClockoutDialog(true);
  };

  const handleConfirmClockout = () => {
    setShowClockoutDialog(false);
    onClockOut();
  };

  const workDuration = useMemo(() => {
    const safeMinutes = Math.max(0, Number(currentWorkDurationMinutes) || 0);
    const hours = Math.floor(safeMinutes / 60);
    const minutes = safeMinutes % 60;
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }, [currentWorkDurationMinutes]);

  const mappedLogs = useMemo(() => {
    return activityLogs.map((log) => {
      const action = String(log.action || "");
      const normalizedAction = action.toLowerCase();

      if (normalizedAction === "clock_in") {
        return {
          ...log,
          label: "Clocked In",
          icon: LogIn,
          color: "text-vibrant-green",
          bgColor: "bg-vibrant-green/10",
        };
      }

      if (normalizedAction === "clock_out") {
        return {
          ...log,
          label: "Clocked Out",
          icon: LogOut,
          color: "text-vibrant-purple",
          bgColor: "bg-vibrant-purple/10",
        };
      }

      if (normalizedAction === "break_start") {
        return {
          ...log,
          label: "Break Started",
          icon: Coffee,
          color: "text-vibrant-orange",
          bgColor: "bg-vibrant-orange/10",
        };
      }

      return {
        ...log,
        label: "Break Ended",
        icon: PlayCircle,
        color: "text-vibrant-blue",
        bgColor: "bg-vibrant-blue/10",
      };
    });
  }, [activityLogs]);

  const formatLogTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Unknown";
    }
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatRelativeLogTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }

    const now = Date.now();
    const diffMinutes = Math.floor((now - date.getTime()) / (1000 * 60));
    if (diffMinutes < 1) {
      return "just now";
    }
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    return "";
  };

  return (
    <Card className="mx-4 mb-6">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">
            Today's Status
          </h2>
          <Badge
            className={`${
              isClockedIn
                ? "bg-vibrant-green text-vibrant-green-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {isClockedIn ? "Clocked In" : "Not Clocked In"}
          </Badge>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl border border-border/40 bg-card/70 p-3">
            <Clock className="h-5 w-5 text-vibrant-blue" />
            <div className="flex-1">
              <p className="font-medium">
                {isClockedIn && clockInTime
                  ? `Clocked in at ${clockInTime}`
                  : "Clock-in time"}
              </p>
              {lateMinutes >= 15 && (
                <div className="flex items-center gap-1 mt-1">
                  <Badge 
                    variant="outline" 
                    className="bg-vibrant-orange/10 text-vibrant-orange border-vibrant-orange/30 text-xs"
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Late ({lateMinutes} min)
                  </Badge>
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                Working hours: {workingHours}
              </p>
              {(isClockedIn || mappedLogs.length > 0) && (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    Total work duration today: {workDuration}
                  </p>
                  {isOnBreak && (
                    <Badge 
                      variant="outline" 
                      className="bg-vibrant-orange/10 text-vibrant-orange border-vibrant-orange/30 text-xs flex items-center gap-1"
                    >
                      <PauseCircle className="h-3 w-3" />
                      On Break
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border/40 bg-gradient-to-b from-card to-card/70 p-3">
          {!isClockedIn ? (
            <Button
              onClick={onClockIn}
              className="h-14 w-full bg-vibrant-green hover:bg-vibrant-green/90 text-vibrant-green-foreground text-base font-semibold rounded-xl shadow-md"
            >
              <LogIn className="h-5 w-5 mr-2.5" />
              Clock In
            </Button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={onBreak}
                variant="outline"
                className={`h-14 text-base font-semibold rounded-xl transition-all ${
                  isOnBreak
                    ? "bg-vibrant-orange text-vibrant-orange-foreground border-vibrant-orange"
                    : "border-vibrant-orange text-vibrant-orange hover:bg-vibrant-orange/10"
                }`}
              >
                <Clock className="h-4.5 w-4.5 mr-2" />
                {isOnBreak ? "End Break" : "Break"}
              </Button>

              <Button
                onClick={handleClockoutClick}
                className="h-14 bg-vibrant-pink hover:bg-vibrant-pink/90 text-vibrant-pink-foreground text-base font-semibold rounded-xl shadow-md"
              >
                <LogOut className="h-5 w-5 mr-2.5" />
                Clock Out
              </Button>
            </div>
          )}
        </div>

        {/* Recent Logs Section - Show only when there are logs for today */}
        {mappedLogs.length > 0 && (
          <>
            <Separator className="my-4" />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-wide text-foreground/85 uppercase">
                  Recent Logs
                </h3>
                <Badge variant="secondary" className="text-[11px] font-medium px-2.5 py-0.5 rounded-full">
                  {mappedLogs.length} today
                </Badge>
              </div>

              <div className="relative pl-3">
                <div className="absolute left-[22px] top-2 bottom-2 w-px bg-gradient-to-b from-border/20 via-border to-border/20" />

                <div className="space-y-2.5">
                  {mappedLogs.map((log) => {
                    const Icon = log.icon;
                    const relativeTime = formatRelativeLogTime(log.loggedAt);
                    return (
                      <div
                        key={log.activityId}
                        className="group flex items-center gap-3 rounded-xl border border-border/40 bg-card/80 px-2.5 py-2.5 transition-all hover:bg-accent/40 hover:border-border"
                      >
                        <div className="relative">
                          <span className="absolute -left-[7px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-border" />
                        </div>

                        <div className={`p-2 rounded-lg ring-1 ring-border/30 ${log.bgColor}`}>
                          <Icon className={`h-4 w-4 ${log.color}`} />
                        </div>

                        <div className="flex-1">
                          <p className="text-sm font-semibold text-foreground/95 leading-none">{log.label}</p>
                          {relativeTime && (
                            <p className="text-[11px] text-muted-foreground mt-1">{relativeTime}</p>
                          )}
                        </div>

                        <span className="text-xs font-medium text-muted-foreground tabular-nums">
                          {formatLogTime(log.loggedAt)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog open={showClockoutDialog} onOpenChange={setShowClockoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Clock Out</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clock out? This will end your current work session.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClockout}>
              Yes, Clock Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}