import { Calendar, Cake, Award } from "lucide-react";
import { Badge } from "./ui/badge";
import { getEmployees } from "./employee-data";
import { motion } from "motion/react";

interface Holiday {
  id: string;
  name: string;
  date: string;
  type: 'public' | 'personal';
  daysUntil: number;
}

interface UpcomingHolidaysProps {
  holidays: Holiday[];
}

export function UpcomingHolidays({ holidays }: UpcomingHolidaysProps) {
  const upcomingHolidays = holidays
    .filter(holiday => holiday.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 3);

  const employees = getEmployees();
  const today = new Date(2025, 9, 19); // Oct 19, 2025

  // Find employees with birthday today
  const birthdaysToday = employees.filter(emp => {
    if (!emp.birthday) return false;
    const bday = new Date(emp.birthday);
    return bday.getMonth() === today.getMonth() && bday.getDate() === today.getDate();
  }).slice(0, 2); // Limit to 2

  // Find employees with work anniversary today
  const anniversariesToday = employees.filter(emp => {
    if (!emp.joinDate || emp.employmentStatus !== "active") return false;
    const joinDate = new Date(emp.joinDate);
    return joinDate.getMonth() === today.getMonth() && 
           joinDate.getDate() === today.getDate() &&
           joinDate.getFullYear() !== today.getFullYear(); // Not their first day
  }).slice(0, 2); // Limit to 2

  return (
    <div className="space-y-4">
          {/* Birthdays Today */}
          {birthdaysToday.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Cake className="h-3 w-3" />
                Birthdays Today
              </p>
              <div className="space-y-2">
                {birthdaysToday.map((emp, index) => (
                  <motion.div 
                    key={emp.id} 
                    className="flex items-center gap-2 p-2 rounded-lg bg-vibrant-pink/10"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.15 + index * 0.05 }}
                  >
                    <Cake className="h-4 w-4 text-vibrant-pink flex-shrink-0" />
                    <p className="text-sm">
                      {emp.firstName} {emp.lastName} 🎂
                    </p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Work Anniversaries Today */}
          {anniversariesToday.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: birthdaysToday.length > 0 ? 0.2 : 0.1 }}
            >
              <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Award className="h-3 w-3" />
                Work Anniversaries Today
              </p>
              <div className="space-y-2">
                {anniversariesToday.map((emp, index) => {
                  const joinDate = new Date(emp.joinDate!);
                  const years = today.getFullYear() - joinDate.getFullYear();
                  
                  return (
                    <motion.div 
                      key={emp.id} 
                      className="flex items-center gap-2 p-2 rounded-lg bg-vibrant-blue/10"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: (birthdaysToday.length > 0 ? 0.25 : 0.15) + index * 0.05 }}
                    >
                      <Award className="h-4 w-4 text-vibrant-blue flex-shrink-0" />
                      <p className="text-sm">
                        {emp.firstName} {emp.lastName} - {years} {years === 1 ? "year" : "years"} 🎉
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Upcoming Holidays */}
          {upcomingHolidays.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ 
                duration: 0.3, 
                delay: (birthdaysToday.length > 0 ? 0.1 : 0) + (anniversariesToday.length > 0 ? 0.1 : 0) + 0.1
              }}
            >
              <p className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Upcoming Holidays
              </p>
              <div className="space-y-2">
                {upcomingHolidays.map((holiday, index) => (
                  <motion.div 
                    key={holiday.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ 
                      duration: 0.3, 
                      delay: (birthdaysToday.length > 0 ? 0.15 : 0) + (anniversariesToday.length > 0 ? 0.15 : 0) + 0.15 + index * 0.05
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-vibrant-purple" />
                      <div>
                        <p className="font-medium">{holiday.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(holiday.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge 
                        variant="outline"
                        className={`${
                          holiday.type === 'public' 
                            ? 'border-vibrant-blue text-vibrant-blue' 
                            : 'border-vibrant-pink text-vibrant-pink'
                        }`}
                      >
                        {holiday.daysUntil === 0 ? 'Today' : 
                         holiday.daysUntil === 1 ? 'Tomorrow' : 
                         `${holiday.daysUntil} days`}
                      </Badge>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {upcomingHolidays.length === 0 && birthdaysToday.length === 0 && anniversariesToday.length === 0 && (
            <motion.p 
              className="text-muted-foreground text-sm text-center py-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              No upcoming celebrations or holidays
            </motion.p>
          )}
        </div>
  );
}