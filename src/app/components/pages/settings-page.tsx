import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Switch } from "../ui/switch";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import {
  User,
  Clock,
  Save,
  Edit,
  Shield,
  Lock,
  Fingerprint,
  Eye,
  EyeOff,
  Check,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Building2,
  ShieldCheck,
  Mail,
  Phone,
  Briefcase,
  IdCard,
  Calendar,
  Cake,
  Globe,
  Heart,
  MapPin,
  FileText,
  CreditCard,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";

interface SettingsPageProps {
  workingHours: { start: string; end: string };
  onUpdateWorkingHours: (hours: {
    start: string;
    end: string;
  }) => void;
  notifications: {
    clockInReminder: boolean;
    clockOutReminder: boolean;
    dailyReport: boolean;
  };
  onUpdateNotifications: (notifications: any) => void;
  userProfile: {
    name: string;
    email: string;
    department: string;
  };
  onUpdateProfile: (profile: any) => void;
}

export function SettingsPage({
  workingHours,
  onUpdateWorkingHours,
  notifications,
  onUpdateNotifications,
  userProfile,
  onUpdateProfile,
}: SettingsPageProps) {
  const [localWorkingHours, setLocalWorkingHours] =
    useState(workingHours);
  const [localProfile, setLocalProfile] = useState({
    ...userProfile,
    phone: "+1 (555) 144-3967",
    birthday: "1984-12-13",
    gender: "Male",
    nationality: "German",
    maritalStatus: "Divorced",
    address: "123 Uso St., Toril, Davao City, 8000, Philippines",
    position: "Human Resource Admin",
    employmentType: "full-time",
    joinDate: "2021-09-10",
    sssNumber: "34-1234567-8",
    tinNumber: "123-456-789-000",
    philhealthNumber: "12-345678901-2",
    pagibigNumber: "1234-5678-9012",
    profilePicture: undefined as string | undefined,
  });

  // Working days state
  const [workingDays, setWorkingDays] = useState<Record<string, boolean>>({
    monday: true,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: true,
    saturday: false,
    sunday: false,
  });

  // Security preferences state
  const [biometricLogin, setBiometricLogin] = useState(true);
  const [biometricClockIn, setBiometricClockIn] =
    useState(false);
  const [showSecurityDialog, setShowSecurityDialog] =
    useState(false);

  // Password update state
  const [showPasswordDialog, setShowPasswordDialog] =
    useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  // Collapsible card states
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSecurityOpen, setIsSecurityOpen] = useState(false);
  const [isWorkingHoursOpen, setIsWorkingHoursOpen] = useState(false);

  // Edit dialog states
  const [showEditContactDialog, setShowEditContactDialog] = useState(false);
  const [showEditEmploymentDialog, setShowEditEmploymentDialog] = useState(false);
  const [showEditGovernmentIdDialog, setShowEditGovernmentIdDialog] = useState(false);
  const [showProfilePictureDialog, setShowProfilePictureDialog] = useState(false);
  const [profilePicturePreview, setProfilePicturePreview] = useState<string | null>(null);

  // Form data states
  const [contactFormData, setContactFormData] = useState({
    email: localProfile.email || "",
    phone: localProfile.phone || "",
    birthday: localProfile.birthday || "",
    gender: localProfile.gender || "Male",
    nationality: localProfile.nationality || "",
    maritalStatus: localProfile.maritalStatus || "Single",
    address: localProfile.address || "",
  });

  const [employmentFormData, setEmploymentFormData] = useState({
    employmentType: localProfile.employmentType || "full-time",
    department: localProfile.department || "",
    position: localProfile.position || "",
    joinDate: localProfile.joinDate || "",
  });

  const [governmentIdFormData, setGovernmentIdFormData] = useState({
    sssNumber: localProfile.sssNumber || "",
    tinNumber: localProfile.tinNumber || "",
    philhealthNumber: localProfile.philhealthNumber || "",
    pagibigNumber: localProfile.pagibigNumber || "",
  });

  // Password activities (mock data)
  const [passwordActivities] = useState([
    {
      id: 1,
      action: "Waive Password",
      date: "Jul 12, 2025 11:47:03 PM",
      platform: "iOS | Philippines",
      status: "Successful",
    },
    {
      id: 2,
      action: "Waive Password",
      date: "Apr 13, 2025 03:39:12 PM",
      platform: "iOS | Philippines",
      status: "Successful",
    },
    {
      id: 3,
      action: "Waive Password",
      date: "Jan 12, 2025 07:22:27 PM",
      platform: "iOS | Philippines",
      status: "Successful",
    },
  ]);

  const handleSaveWorkingHours = () => {
    onUpdateWorkingHours(localWorkingHours);
    toast.success("Work schedule updated successfully");
  };

  const handleUpdateContact = () => {
    if (!contactFormData.email || !contactFormData.phone || !contactFormData.birthday || !contactFormData.nationality || !contactFormData.address) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLocalProfile({ ...localProfile, ...contactFormData });
    toast.success("Contact information updated successfully");
    setShowEditContactDialog(false);
  };

  const handleUpdateEmployment = () => {
    if (!employmentFormData.employmentType || !employmentFormData.department || !employmentFormData.position || !employmentFormData.joinDate) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLocalProfile({ ...localProfile, ...employmentFormData });
    toast.success("Employment details updated successfully");
    setShowEditEmploymentDialog(false);
  };

  const handleUpdateGovernmentId = () => {
    setLocalProfile({ ...localProfile, ...governmentIdFormData });
    toast.success("Government ID information updated successfully");
    setShowEditGovernmentIdDialog(false);
  };

  const handleNotificationChange = (
    key: string,
    value: boolean,
  ) => {
    const updated = { ...notifications, [key]: value };
    onUpdateNotifications(updated);
    toast.success(
      `${key.replace(/([A-Z])/g, " $1").toLowerCase()} ${value ? "enabled" : "disabled"}`,
    );
  };

  const handleWorkingDayToggle = (day: string) => {
    setWorkingDays((prev) => ({
      ...prev,
      [day]: !prev[day],
    }));
  };

  // Password validation
  const passwordValidations = {
    notBlank: newPassword.length > 0,
    length: newPassword.length >= 8 && newPassword.length <= 30,
    hasLetter: /[a-zA-Z]/.test(newPassword),
    hasNumber: /\d/.test(newPassword),
    hasSymbol: /[!@#$%^&*(),.?":{}|<>]/.test(newPassword),
  };

  const validationCount = Object.values(
    passwordValidations,
  ).filter(Boolean).length;

  const handleSavePassword = () => {
    if (validationCount === 5) {
      setShowPasswordDialog(false);
      setNewPassword("");
      toast.success("Password updated successfully");
    } else {
      toast.error("Please meet all password requirements");
    }
  };

  const handleProfilePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error("Please upload a valid image file (JPEG, PNG, GIF, or WebP)");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should not exceed 5MB");
      return;
    }

    // Read and validate image dimensions
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const aspectRatio = img.width / img.height;
        
        // Check if image is roughly square (aspect ratio between 0.8 and 1.2)
        if (aspectRatio < 0.8 || aspectRatio > 1.2) {
          toast.error("Please upload a square image (1:1 aspect ratio) for best results");
          return;
        }

        // Image is valid, set preview
        setProfilePicturePreview(event.target?.result as string);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfilePicture = () => {
    if (!profilePicturePreview) {
      toast.error("Please select an image");
      return;
    }

    setLocalProfile({
      ...localProfile,
      profilePicture: profilePicturePreview,
    });
    toast.success("Profile picture updated successfully");
    setShowProfilePictureDialog(false);
    setProfilePicturePreview(null);
  };

  const handleRemoveProfilePicture = () => {
    setLocalProfile({
      ...localProfile,
      profilePicture: undefined,
    });
    toast.success("Profile picture removed");
    setShowProfilePictureDialog(false);
    setProfilePicturePreview(null);
  };

  const days = [
    { key: "monday", label: "Monday" },
    { key: "tuesday", label: "Tuesday" },
    { key: "wednesday", label: "Wednesday" },
    { key: "thursday", label: "Thursday" },
    { key: "friday", label: "Friday" },
    { key: "saturday", label: "Saturday" },
    { key: "sunday", label: "Sunday" },
  ];

  // Calculate years of service
  const calculateYearsOfService = (joinDate: string) => {
    const join = new Date(joinDate);
    const now = new Date();
    const years = now.getFullYear() - join.getFullYear();
    const months = now.getMonth() - join.getMonth();
    
    if (years === 0) {
      return `${months} months`;
    } else if (months < 0) {
      return `${years - 1} years`;
    }
    return `${years} years`;
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="px-4 space-y-4">
        {/* My Profile Card - Merged with Contact, Employment, and Government ID */}
        <Collapsible open={isProfileOpen} onOpenChange={setIsProfileOpen}>
          <Card>
            <CardHeader className="pb-3">
              <CollapsibleTrigger className="flex items-center gap-2 w-full">
                <CardTitle className="flex items-center gap-2 flex-1">
                  <User className="h-5 w-5 text-vibrant-green" />
                  My Profile
                </CardTitle>
                {isProfileOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-6">
                {/* Profile Header with Avatar */}
                <div className="flex items-center gap-4 pb-4 border-b">
                  <div className="relative">
                    {localProfile.profilePicture ? (
                      <img
                        src={localProfile.profilePicture}
                        alt={localProfile.name}
                        className="h-16 w-16 rounded-full object-cover border-2 border-vibrant-blue"
                      />
                    ) : (
                      <Avatar className="h-16 w-16">
                        <AvatarFallback className="bg-vibrant-blue text-vibrant-blue-foreground text-lg">
                          {localProfile.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <button
                      onClick={() => {
                        setProfilePicturePreview(localProfile.profilePicture || null);
                        setShowProfilePictureDialog(true);
                      }}
                      className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-vibrant-blue text-white flex items-center justify-center hover:bg-vibrant-blue/90 transition-colors"
                    >
                      <Edit className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-lg">
                      {localProfile.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {localProfile.position}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {localProfile.department}
                    </p>
                  </div>
                </div>

                {/* Contact Information Section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Mail className="h-4 w-4 text-vibrant-blue" />
                      Contact Information
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setContactFormData({
                          email: localProfile.email || "",
                          phone: localProfile.phone || "",
                          birthday: localProfile.birthday || "",
                          gender: localProfile.gender || "Male",
                          nationality: localProfile.nationality || "",
                          maritalStatus: localProfile.maritalStatus || "Single",
                          address: localProfile.address || "",
                        });
                        setShowEditContactDialog(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Mail className="h-4 w-4 text-vibrant-blue mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Email</p>
                        <p className="break-all">{localProfile.email}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Phone className="h-4 w-4 text-vibrant-green mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Phone</p>
                        <p>{localProfile.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Cake className="h-4 w-4 text-vibrant-purple mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Birthday</p>
                        <p>
                          {localProfile.birthday && new Date(localProfile.birthday).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <User className="h-4 w-4 text-vibrant-orange mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Gender</p>
                        <p>{localProfile.gender}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Globe className="h-4 w-4 text-vibrant-blue mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Nationality</p>
                        <p>{localProfile.nationality}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Heart className="h-4 w-4 text-destructive mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Marital Status</p>
                        <p>{localProfile.maritalStatus}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-vibrant-green mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Address</p>
                        <p>{localProfile.address || "No address provided"}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Employment Details Section */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-vibrant-purple" />
                      Employment Details
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEmploymentFormData({
                          employmentType: localProfile.employmentType || "full-time",
                          department: localProfile.department || "",
                          position: localProfile.position || "",
                          joinDate: localProfile.joinDate || "",
                        });
                        setShowEditEmploymentDialog(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Briefcase className="h-4 w-4 text-vibrant-purple mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Employment Type</p>
                        <p className="capitalize">{localProfile.employmentType.replace("-", " ")}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Building2 className="h-4 w-4 text-vibrant-orange mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Department</p>
                        <p>{localProfile.department}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <IdCard className="h-4 w-4 text-vibrant-blue mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Position</p>
                        <p>{localProfile.position}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Calendar className="h-4 w-4 text-vibrant-green mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Join Date</p>
                        <p>
                          {localProfile.joinDate && new Date(localProfile.joinDate).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Clock className="h-4 w-4 text-vibrant-purple mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Years of Service</p>
                        <p>{calculateYearsOfService(localProfile.joinDate)}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Government ID Section */}
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-vibrant-orange" />
                      Government ID no
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setGovernmentIdFormData({
                          sssNumber: localProfile.sssNumber || "",
                          tinNumber: localProfile.tinNumber || "",
                          philhealthNumber: localProfile.philhealthNumber || "",
                          pagibigNumber: localProfile.pagibigNumber || "",
                        });
                        setShowEditGovernmentIdDialog(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <FileText className="h-4 w-4 text-vibrant-blue mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">SSS Number</p>
                        <p>{localProfile.sssNumber || "Not provided"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <FileText className="h-4 w-4 text-vibrant-green mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">TIN Number</p>
                        <p>{localProfile.tinNumber || "Not provided"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <FileText className="h-4 w-4 text-vibrant-purple mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">PhilHealth Number</p>
                        <p>{localProfile.philhealthNumber || "Not provided"}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <FileText className="h-4 w-4 text-vibrant-orange mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Pag-IBIG Number</p>
                        <p>{localProfile.pagibigNumber || "Not provided"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Working Hours - Collapsible */}
        <Card>
          <CardHeader 
            className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setIsWorkingHoursOpen(!isWorkingHoursOpen)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-vibrant-orange" />
                Company Working Hours
              </CardTitle>
              <motion.div
                animate={{ rotate: isWorkingHoursOpen ? 180 : 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsWorkingHoursOpen(!isWorkingHoursOpen);
                  }}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </motion.div>
            </div>
          </CardHeader>
          <AnimatePresence initial={false}>
            {isWorkingHoursOpen && (
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start-time">Start Time</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={localWorkingHours.start}
                  onChange={(e) =>
                    setLocalWorkingHours((prev) => ({
                      ...prev,
                      start: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="end-time">End Time</Label>
                <Input
                  id="end-time"
                  type="time"
                  value={localWorkingHours.end}
                  onChange={(e) =>
                    setLocalWorkingHours((prev) => ({
                      ...prev,
                      end: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <Label className="mb-3 block">Work Days</Label>
              <div className="space-y-2">
                {days.map((day) => (
                  <div
                    key={day.key}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{day.label}</span>
                      {workingDays[day.key] ? (
                        <Badge className="bg-vibrant-green/20 text-vibrant-green hover:bg-vibrant-green/30">
                          Working Day
                        </Badge>
                      ) : (
                        <Badge className="bg-vibrant-purple/20 text-vibrant-purple hover:bg-vibrant-purple/30">
                          Rest Day
                        </Badge>
                      )}
                    </div>
                    <Switch
                      checked={workingDays[day.key]}
                      onCheckedChange={() => handleWorkingDayToggle(day.key)}
                    />
                  </div>
                ))}
              </div>
            </div>

                  <Button
                    onClick={handleSaveWorkingHours}
                    className="w-full bg-vibrant-orange hover:bg-vibrant-orange/90 text-vibrant-orange-foreground"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save Work Schedule
                  </Button>
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* Security Preferences - Collapsible */}
        <Card>
          <CardHeader 
            className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => setIsSecurityOpen(!isSecurityOpen)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-vibrant-blue" />
                Security
              </CardTitle>
              <motion.div
                animate={{ rotate: isSecurityOpen ? 180 : 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsSecurityOpen(!isSecurityOpen);
                  }}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </motion.div>
            </div>
          </CardHeader>
          <AnimatePresence initial={false}>
            {isSecurityOpen && (
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
                <CardContent className="space-y-3 pt-0">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => setShowSecurityDialog(true)}
            >
              <Fingerprint className="h-5 w-5 mr-2 text-vibrant-purple" />
              Security Preferences
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => setShowPasswordDialog(true)}
            >
              <Lock className="h-5 w-5 mr-2 text-vibrant-orange" />
              Update Password
            </Button>

            {/* Contact Support */}
            <div className="pt-3 mt-3 border-t border-border">
              <p className="text-sm text-muted-foreground mb-1">
                Need help?
              </p>
              <a
                href="mailto:support@mit003.com"
                className="text-sm text-vibrant-blue hover:underline"
              >
                support@mit003.com
              </a>
            </div>
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>

      {/* Edit Contact Information Dialog */}
      <Dialog open={showEditContactDialog} onOpenChange={setShowEditContactDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Contact Information</DialogTitle>
            <DialogDescription>
              Update your contact information
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-email">Email *</Label>
              <Input
                id="edit-email"
                type="email"
                value={contactFormData.email}
                onChange={(e) => setContactFormData({ ...contactFormData, email: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-phone">Phone *</Label>
              <Input
                id="edit-phone"
                type="tel"
                value={contactFormData.phone}
                onChange={(e) => setContactFormData({ ...contactFormData, phone: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-birthday">Birthday *</Label>
              <Input
                id="edit-birthday"
                type="date"
                value={contactFormData.birthday}
                onChange={(e) => setContactFormData({ ...contactFormData, birthday: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-gender">Gender *</Label>
              <Select
                value={contactFormData.gender}
                onValueChange={(value: any) => setContactFormData({ ...contactFormData, gender: value })}
              >
                <SelectTrigger id="edit-gender">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                  <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-nationality">Nationality *</Label>
              <Input
                id="edit-nationality"
                value={contactFormData.nationality}
                onChange={(e) => setContactFormData({ ...contactFormData, nationality: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-maritalStatus">Marital Status *</Label>
              <Select
                value={contactFormData.maritalStatus}
                onValueChange={(value: any) => setContactFormData({ ...contactFormData, maritalStatus: value })}
              >
                <SelectTrigger id="edit-maritalStatus">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Single">Single</SelectItem>
                  <SelectItem value="Married">Married</SelectItem>
                  <SelectItem value="Divorced">Divorced</SelectItem>
                  <SelectItem value="Widowed">Widowed</SelectItem>
                  <SelectItem value="Prefer not to say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-address">Address *</Label>
              <Input
                id="edit-address"
                value={contactFormData.address}
                onChange={(e) => setContactFormData({ ...contactFormData, address: e.target.value })}
                placeholder="Search for address (e.g., 123 Main St, City, Country)"
                autoComplete="street-address"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter complete address with street, city, and country
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditContactDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateContact} className="bg-vibrant-blue hover:bg-vibrant-blue/90">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Employment Details Dialog */}
      <Dialog open={showEditEmploymentDialog} onOpenChange={setShowEditEmploymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Employment Details</DialogTitle>
            <DialogDescription>
              Update your employment information
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-employmentType">Employment Type *</Label>
              <Select
                value={employmentFormData.employmentType}
                onValueChange={(value: any) => setEmploymentFormData({ ...employmentFormData, employmentType: value })}
              >
                <SelectTrigger id="edit-employmentType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full-time">Full-Time</SelectItem>
                  <SelectItem value="independent contractor">Independent Contractor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-department">Department *</Label>
              <Input
                id="edit-department"
                value={employmentFormData.department}
                onChange={(e) => setEmploymentFormData({ ...employmentFormData, department: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-position">Position *</Label>
              <Input
                id="edit-position"
                value={employmentFormData.position}
                onChange={(e) => setEmploymentFormData({ ...employmentFormData, position: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="edit-joinDate">Join Date *</Label>
              <Input
                id="edit-joinDate"
                type="date"
                value={employmentFormData.joinDate}
                onChange={(e) => setEmploymentFormData({ ...employmentFormData, joinDate: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditEmploymentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateEmployment} className="bg-vibrant-purple hover:bg-vibrant-purple/90">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Government ID Dialog */}
      <Dialog open={showEditGovernmentIdDialog} onOpenChange={setShowEditGovernmentIdDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Government ID no</DialogTitle>
            <DialogDescription>
              Update your government identification numbers
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-sssNumber">SSS Number</Label>
              <Input
                id="edit-sssNumber"
                value={governmentIdFormData.sssNumber}
                onChange={(e) => setGovernmentIdFormData({ ...governmentIdFormData, sssNumber: e.target.value })}
                placeholder="XX-XXXXXXX-X"
              />
            </div>
            <div>
              <Label htmlFor="edit-tinNumber">TIN Number</Label>
              <Input
                id="edit-tinNumber"
                value={governmentIdFormData.tinNumber}
                onChange={(e) => setGovernmentIdFormData({ ...governmentIdFormData, tinNumber: e.target.value })}
                placeholder="XXX-XXX-XXX-XXX"
              />
            </div>
            <div>
              <Label htmlFor="edit-philhealthNumber">PhilHealth Number</Label>
              <Input
                id="edit-philhealthNumber"
                value={governmentIdFormData.philhealthNumber}
                onChange={(e) => setGovernmentIdFormData({ ...governmentIdFormData, philhealthNumber: e.target.value })}
                placeholder="XX-XXXXXXXXX-X"
              />
            </div>
            <div>
              <Label htmlFor="edit-pagibigNumber">Pag-IBIG Number</Label>
              <Input
                id="edit-pagibigNumber"
                value={governmentIdFormData.pagibigNumber}
                onChange={(e) => setGovernmentIdFormData({ ...governmentIdFormData, pagibigNumber: e.target.value })}
                placeholder="XXXX-XXXX-XXXX"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditGovernmentIdDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateGovernmentId} className="bg-vibrant-orange hover:bg-vibrant-orange/90">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Security Preferences Dialog */}
      <Dialog
        open={showSecurityDialog}
        onOpenChange={setShowSecurityDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-vibrant-purple" />
              Security Preferences
            </DialogTitle>
            <DialogDescription>
              Configure biometric authentication settings for
              your account
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="font-medium">Biometric Login</p>
                <p className="text-sm text-muted-foreground">
                  Use biometric authentication for mobile app
                  login
                </p>
              </div>
              <Switch
                checked={biometricLogin}
                onCheckedChange={(checked) => {
                  setBiometricLogin(checked);
                  toast.success(
                    `Biometric login ${checked ? "enabled" : "disabled"}`,
                  );
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="font-medium">
                  Biometric Clock-In/Out
                </p>
                <p className="text-sm text-muted-foreground">
                  Use biometric authentication for attendance
                  transactions
                </p>
              </div>
              <Switch
                checked={biometricClockIn}
                onCheckedChange={(checked) => {
                  setBiometricClockIn(checked);
                  toast.success(
                    `Biometric clock-in/out ${checked ? "enabled" : "disabled"}`,
                  );
                }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Update Dialog */}
      <Dialog
        open={showPasswordDialog}
        onOpenChange={setShowPasswordDialog}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Update Password</DialogTitle>
            <DialogDescription>
              Update your account password with validation
              requirements
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) =>
                    setNewPassword(e.target.value)
                  }
                  placeholder="Enter new password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>

              {/* Password Strength Indicators */}
              <div className="flex gap-2 mt-2">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i < validationCount
                        ? "bg-vibrant-green"
                        : "bg-muted"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div>
              <Label>Password Requirements</Label>
              <div className="space-y-2 mt-2">
                <div className="flex items-center gap-2 text-sm">
                  <div
                    className={`h-4 w-4 rounded border flex items-center justify-center ${
                      passwordValidations.notBlank
                        ? "bg-vibrant-green border-vibrant-green"
                        : "border-muted-foreground"
                    }`}
                  >
                    {passwordValidations.notBlank && (
                      <Check className="h-3 w-3 text-white" />
                    )}
                  </div>
                  <span
                    className={
                      passwordValidations.notBlank
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    Password should not be blank
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div
                    className={`h-4 w-4 rounded border flex items-center justify-center ${
                      passwordValidations.length
                        ? "bg-vibrant-green border-vibrant-green"
                        : "border-muted-foreground"
                    }`}
                  >
                    {passwordValidations.length && (
                      <Check className="h-3 w-3 text-white" />
                    )}
                  </div>
                  <span
                    className={
                      passwordValidations.length
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    Password should be 8 - 30 characters
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div
                    className={`h-4 w-4 rounded border flex items-center justify-center ${
                      passwordValidations.hasLetter
                        ? "bg-vibrant-green border-vibrant-green"
                        : "border-muted-foreground"
                    }`}
                  >
                    {passwordValidations.hasLetter && (
                      <Check className="h-3 w-3 text-white" />
                    )}
                  </div>
                  <span
                    className={
                      passwordValidations.hasLetter
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    Password should contain a letter
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div
                    className={`h-4 w-4 rounded border flex items-center justify-center ${
                      passwordValidations.hasNumber
                        ? "bg-vibrant-green border-vibrant-green"
                        : "border-muted-foreground"
                    }`}
                  >
                    {passwordValidations.hasNumber && (
                      <Check className="h-3 w-3 text-white" />
                    )}
                  </div>
                  <span
                    className={
                      passwordValidations.hasNumber
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    Password should contain a number
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <div
                    className={`h-4 w-4 rounded border flex items-center justify-center ${
                      passwordValidations.hasSymbol
                        ? "bg-vibrant-green border-vibrant-green"
                        : "border-muted-foreground"
                    }`}
                  >
                    {passwordValidations.hasSymbol && (
                      <Check className="h-3 w-3 text-white" />
                    )}
                  </div>
                  <span
                    className={
                      passwordValidations.hasSymbol
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    Password should contain a symbol
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <Label className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-vibrant-orange"></span>
                  Recent Activities
                </Label>
                <Button variant="outline" size="sm">
                  View More
                </Button>
              </div>

              <div className="space-y-3 max-h-48 overflow-y-auto bg-muted/30 p-3 rounded-lg">
                {passwordActivities.map((activity) => (
                  <div
                    key={activity.id}
                    className="border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-sm">
                          {activity.action}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activity.date}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {activity.platform}
                        </p>
                      </div>
                      <span className="text-xs text-vibrant-green">
                        {activity.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSavePassword}
                disabled={validationCount !== 5}
                className="flex-1 bg-vibrant-orange hover:bg-vibrant-orange/90 text-vibrant-orange-foreground"
              >
                Update Password
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Profile Picture Dialog */}
      <Dialog open={showProfilePictureDialog} onOpenChange={setShowProfilePictureDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Profile Picture</DialogTitle>
            <DialogDescription>
              Upload a square image (1:1 aspect ratio) for the best results. Max file size: 5MB.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4">
              {profilePicturePreview ? (
                <img
                  src={profilePicturePreview}
                  alt="Preview"
                  className="h-32 w-32 rounded-full object-cover border-2 border-vibrant-blue"
                />
              ) : localProfile.profilePicture ? (
                <img
                  src={localProfile.profilePicture}
                  alt={localProfile.name}
                  className="h-32 w-32 rounded-full object-cover border-2 border-vibrant-blue"
                />
              ) : (
                <div className="h-32 w-32 rounded-full bg-vibrant-blue/10 flex items-center justify-center">
                  <User className="h-16 w-16 text-vibrant-blue" />
                </div>
              )}

              <div className="w-full space-y-3">
                <Label htmlFor="profile-picture-upload" className="cursor-pointer">
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-vibrant-blue/50 transition-colors">
                    <div className="flex flex-col items-center gap-2">
                      <User className="h-8 w-8 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Click to upload</p>
                        <p className="text-xs text-muted-foreground">
                          JPEG, PNG, GIF, or WebP (Max 5MB)
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Square image recommended
                        </p>
                      </div>
                    </div>
                  </div>
                  <input
                    id="profile-picture-upload"
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    onChange={handleProfilePictureChange}
                    className="hidden"
                  />
                </Label>
                
                {(localProfile.profilePicture || profilePicturePreview) && (
                  <Button
                    variant="outline"
                    onClick={handleRemoveProfilePicture}
                    className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    Remove Picture
                  </Button>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowProfilePictureDialog(false);
                setProfilePicturePreview(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveProfilePicture}
              disabled={!profilePicturePreview}
              className="bg-vibrant-blue hover:bg-vibrant-blue/90"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

