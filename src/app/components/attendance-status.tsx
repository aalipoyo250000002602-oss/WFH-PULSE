import { useState, useEffect } from "react";
import { Clock, LogIn, Coffee, PlayCircle, LogOut, AlertCircle, PauseCircle } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";

interface AttendanceStatusProps {
  isClockedIn: boolean;
  clockInTime?: string;
  workingHours: string;
  clockInTimestamp?: Date;
  scheduledStartTime: string;
  isOnBreak?: boolean;
}

export function AttendanceStatus({
  isClockedIn,
  clockInTime,
  workingHours,
  clockInTimestamp,
  scheduledStartTime,
  isOnBreak = false,
}: AttendanceStatusProps) {
  const [workDuration, setWorkDuration] = useState("00:00:00");
  const [isLate, setIsLate] = useState(false);

  // Calculate if user is late (more than 15 minutes after scheduled start time)
  useEffect(() => {
    if (isClockedIn && clockInTimestamp && scheduledStartTime) {
      const [startHour, startMinute] = scheduledStartTime.split(':').map(Number);
      const scheduledStart = new Date(clockInTimestamp);
      scheduledStart.setHours(startHour, startMinute, 0, 0);
      
      // Check if clock-in time is more than 15 minutes after scheduled start
      const diffMinutes = (clockInTimestamp.getTime() - scheduledStart.getTime()) / (1000 * 60);
      setIsLate(diffMinutes > 15);
    } else {
      setIsLate(false);
    }
  }, [isClockedIn, clockInTimestamp, scheduledStartTime]);

  // Calculate work duration (pauses when on break)
  useEffect(() => {
    if (!isClockedIn || !clockInTimestamp) {
      setWorkDuration("00:00:00");
      return;
    }

    // Don't update if on break
    if (isOnBreak) {
      return;
    }

    const updateDuration = () => {
      const now = new Date();
      const diff = now.getTime() - clockInTimestamp.getTime();
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setWorkDuration(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    };

    updateDuration();
    const interval = setInterval(updateDuration, 1000);

    return () => clearInterval(interval);
  }, [isClockedIn, clockInTimestamp, isOnBreak]);
  // Dummy activity logs
  const activityLogs = [
    {
      id: 1,
      action: "Clocked In",
      time: "9:00 AM",
      icon: LogIn,
      color: "text-vibrant-green",
      bgColor: "bg-vibrant-green/10",
    },
    {
      id: 2,
      action: "Break Started",
      time: "12:30 PM",
      icon: Coffee,
      color: "text-vibrant-orange",
      bgColor: "bg-vibrant-orange/10",
    },
    {
      id: 3,
      action: "Break Ended",
      time: "1:00 PM",
      icon: PlayCircle,
      color: "text-vibrant-blue",
      bgColor: "bg-vibrant-blue/10",
    },
    {
      id: 4,
      action: "Clocked Out",
      time: "6:00 PM",
      icon: LogOut,
      color: "text-vibrant-purple",
      bgColor: "bg-vibrant-purple/10",
    },
  ];

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
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-vibrant-blue" />
            <div className="flex-1">
              <p className="font-medium">
                {isClockedIn && clockInTime
                  ? `Clocked in at ${clockInTime}`
                  : "Clock-in time"}
              </p>
              {isLate && (
                <div className="flex items-center gap-1 mt-1">
                  <Badge 
                    variant="outline" 
                    className="bg-vibrant-orange/10 text-vibrant-orange border-vibrant-orange/30 text-xs"
                  >
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Late (15+ min)
                  </Badge>
                </div>
              )}
              <p className="text-sm text-muted-foreground mt-1">
                Working hours: {workingHours}
              </p>
              {isClockedIn && (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    Work duration: {workDuration}
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

        {/* Recent Logs Section - Only show when clocked in */}
        {isClockedIn && (
          <>
            <Separator className="my-4" />
            
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Recent Logs
              </h3>
              <div className="space-y-2">
                {activityLogs.map((log) => {
                  const Icon = log.icon;
                  return (
                    <div
                      key={log.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className={`p-2 rounded-lg ${log.bgColor}`}>
                        <Icon className={`h-4 w-4 ${log.color}`} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{log.action}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {log.time}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}