import { useEffect, useState } from "react";
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
  workingDays: {
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
  };
  onUpdateWorkingHours: (schedule: {
    start: string;
    end: string;
    days: {
      monday: boolean;
      tuesday: boolean;
      wednesday: boolean;
      thursday: boolean;
      friday: boolean;
      saturday: boolean;
      sunday: boolean;
    };
  }) => Promise<boolean>;
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
    departmentId?: number | null;
    phone?: string;
    birthday?: string;
    gender?: string;
    nationality?: string;
    maritalStatus?: string;
    address?: string;
    position?: string;
    positionId?: number | null;
    employmentType?: string;
    joinDate?: string;
    sssNumber?: string;
    tinNumber?: string;
    philhealthNumber?: string;
    pagibigNumber?: string;
    profilePicture?: string;
  };
  employmentOptions: {
    employmentTypes: string[];
    departments: Array<{ departmentId: number; name: string }>;
    positions: Array<{ positionId: number; departmentId: number; name: string }>;
  };
  onUpdateProfile: (profile: Record<string, unknown>) => Promise<boolean>;
}

export function SettingsPage({
  workingHours,
  workingDays,
  onUpdateWorkingHours,
  notifications,
  onUpdateNotifications,
  userProfile,
  employmentOptions,
  onUpdateProfile,
}: SettingsPageProps) {
  const [localWorkingHours, setLocalWorkingHours] =
    useState(workingHours);
  const [localWorkingDays, setLocalWorkingDays] = useState(workingDays);
  const [localProfile, setLocalProfile] = useState({
    ...userProfile,
    phone: userProfile.phone || "",
    birthday: userProfile.birthday || "",
    gender: userProfile.gender || "Male",
    nationality: userProfile.nationality || "",
    maritalStatus: userProfile.maritalStatus || "Single",
    address: userProfile.address || "",
    departmentId: userProfile.departmentId ?? null,
    position: userProfile.position || "",
    positionId: userProfile.positionId ?? null,
    employmentType: userProfile.employmentType || "full-time",
    joinDate: userProfile.joinDate || "",
    sssNumber: userProfile.sssNumber || "",
    tinNumber: userProfile.tinNumber || "",
    philhealthNumber: userProfile.philhealthNumber || "",
    pagibigNumber: userProfile.pagibigNumber || "",
    profilePicture: userProfile.profilePicture,
  });

  useEffect(() => {
    setLocalWorkingHours(workingHours);
  }, [workingHours]);

  useEffect(() => {
    setLocalWorkingDays(workingDays);
  }, [workingDays]);

  useEffect(() => {
    setLocalProfile((prev) => ({
      ...prev,
      ...userProfile,
      phone: userProfile.phone || "",
      birthday: userProfile.birthday || "",
      gender: userProfile.gender || "Male",
      nationality: userProfile.nationality || "",
      maritalStatus: userProfile.maritalStatus || "Single",
      address: userProfile.address || "",
      departmentId: userProfile.departmentId ?? null,
      position: userProfile.position || "",
      positionId: userProfile.positionId ?? null,
      employmentType: userProfile.employmentType || "full-time",
      joinDate: userProfile.joinDate || "",
      sssNumber: userProfile.sssNumber || "",
      tinNumber: userProfile.tinNumber || "",
      philhealthNumber: userProfile.philhealthNumber || "",
      pagibigNumber: userProfile.pagibigNumber || "",
      profilePicture: userProfile.profilePicture,
    }));
  }, [userProfile]);

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
  const [isProfileSaving, setIsProfileSaving] = useState(false);

  const buildContactFormData = (profile: typeof localProfile) => ({
    email: profile.email || "",
    phone: profile.phone || "",
    birthday: profile.birthday || "",
    gender: profile.gender || "Male",
    nationality: profile.nationality || "",
    maritalStatus: profile.maritalStatus || "Single",
    address: profile.address || "",
  });

  const buildEmploymentFormData = (profile: typeof localProfile) => ({
    employmentType: profile.employmentType || "full-time",
    departmentId:
      profile.departmentId != null
        ? String(profile.departmentId)
        : profile.department
          ? String(
              employmentOptions.departments.find(
                (department) => department.name === profile.department,
              )?.departmentId ?? "",
            )
          : "",
    positionId:
      profile.positionId != null
        ? String(profile.positionId)
        : profile.position
          ? String(
              employmentOptions.positions.find(
                (position) => position.name === profile.position,
              )?.positionId ?? "",
            )
          : "",
    joinDate: profile.joinDate || "",
  });

  const buildGovernmentIdFormData = (profile: typeof localProfile) => ({
    sssNumber: profile.sssNumber || "",
    tinNumber: profile.tinNumber || "",
    philhealthNumber: profile.philhealthNumber || "",
    pagibigNumber: profile.pagibigNumber || "",
  });

  // Form data states
  const [contactFormData, setContactFormData] = useState(buildContactFormData(localProfile));

  const [employmentFormData, setEmploymentFormData] = useState(buildEmploymentFormData(localProfile));

  useEffect(() => {
    setEmploymentFormData(buildEmploymentFormData(localProfile));
  }, [employmentOptions]);

  const [governmentIdFormData, setGovernmentIdFormData] = useState(buildGovernmentIdFormData(localProfile));

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

  const handleSaveWorkingHours = async () => {
    const hasWorkingDay = Object.values(localWorkingDays).some(Boolean);

    if (!hasWorkingDay) {
      toast.error("Select at least one working day");
      return;
    }

    if (!localWorkingHours.start || !localWorkingHours.end) {
      toast.error("Start and end time are required for working days");
      return;
    }

    if (localWorkingHours.start >= localWorkingHours.end) {
      toast.error("Start time must be earlier than end time");
      return;
    }

    const didSave = await onUpdateWorkingHours({
      start: localWorkingHours.start,
      end: localWorkingHours.end,
      days: localWorkingDays,
    });

    if (didSave) {
      toast.success("Work schedule updated successfully");
    }
  };

  const withProfileSaving = async (action: () => Promise<void>) => {
    if (isProfileSaving) {
      return;
    }

    setIsProfileSaving(true);
    try {
      await action();
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handleUpdateContact = async () => {
    if (!contactFormData.email || !contactFormData.phone || !contactFormData.birthday || !contactFormData.nationality || !contactFormData.address) {
      toast.error("Please fill in all required fields");
      return;
    }

    await withProfileSaving(async () => {
      const didUpdate = await onUpdateProfile({
        email: contactFormData.email,
        phone: contactFormData.phone,
        birthday: contactFormData.birthday,
        gender: contactFormData.gender,
        nationality: contactFormData.nationality,
        maritalStatus: contactFormData.maritalStatus,
        address: contactFormData.address,
      });

      if (didUpdate) {
        toast.success("Contact information updated successfully");
        setShowEditContactDialog(false);
      }
    });
  };

  const handleUpdateEmployment = async () => {
    if (
      !employmentFormData.employmentType ||
      !employmentFormData.departmentId ||
      !employmentFormData.positionId ||
      !employmentFormData.joinDate
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    const selectedDepartment = employmentOptions.departments.find(
      (department) => String(department.departmentId) === employmentFormData.departmentId,
    );
    const selectedPosition = employmentOptions.positions.find(
      (position) => String(position.positionId) === employmentFormData.positionId,
    );

    if (!selectedDepartment || !selectedPosition) {
      toast.error("Please select valid department and position options");
      return;
    }

    await withProfileSaving(async () => {
      const didUpdate = await onUpdateProfile({
        employmentType: employmentFormData.employmentType,
        departmentId: Number(employmentFormData.departmentId),
        positionId: Number(employmentFormData.positionId),
        joinDate: employmentFormData.joinDate,
      });

      if (didUpdate) {
        toast.success("Employment details updated successfully");
        setShowEditEmploymentDialog(false);
      }
    });
  };

  const handleUpdateGovernmentId = async () => {
    const isSssValid =
      !governmentIdFormData.sssNumber ||
      /^\d{2}-\d{7}-\d$/.test(governmentIdFormData.sssNumber);
    const isTinValid =
      !governmentIdFormData.tinNumber ||
      /^\d{3}-\d{3}-\d{3}-\d{3}$/.test(governmentIdFormData.tinNumber);
    const isPhilHealthValid =
      !governmentIdFormData.philhealthNumber ||
      /^\d{2}-\d{9}-\d$/.test(governmentIdFormData.philhealthNumber);
    const isPagIbigValid =
      !governmentIdFormData.pagibigNumber ||
      /^\d{4}-\d{4}-\d{4}$/.test(governmentIdFormData.pagibigNumber);

    if (!isSssValid || !isTinValid || !isPhilHealthValid || !isPagIbigValid) {
      toast.error("Please follow the required Government ID formats");
      return;
    }

    await withProfileSaving(async () => {
      const didUpdate = await onUpdateProfile({
        sssNumber: governmentIdFormData.sssNumber || null,
        tinNumber: governmentIdFormData.tinNumber || null,
        philhealthNumber: governmentIdFormData.philhealthNumber || null,
        pagibigNumber: governmentIdFormData.pagibigNumber || null,
      });

      if (didUpdate) {
        toast.success("Government ID information updated successfully");
        setShowEditGovernmentIdDialog(false);
      }
    });
  };

  const handleClearContactDetails = async () => {
    await withProfileSaving(async () => {
      const didUpdate = await onUpdateProfile({
        phone: null,
        birthday: null,
        gender: null,
        nationality: null,
        maritalStatus: null,
        address: null,
      });

      if (didUpdate) {
        toast.success("Contact details cleared successfully");
        setShowEditContactDialog(false);
      }
    });
  };

  const handleClearEmploymentDetails = async () => {
    await withProfileSaving(async () => {
      const didUpdate = await onUpdateProfile({
        departmentId: null,
        position: null,
        positionId: null,
        joinDate: null,
      });

      if (didUpdate) {
        toast.success("Employment details cleared successfully");
        setShowEditEmploymentDialog(false);
      }
    });
  };

  const handleClearGovernmentIds = async () => {
    await withProfileSaving(async () => {
      const didUpdate = await onUpdateProfile({
        sssNumber: null,
        tinNumber: null,
        philhealthNumber: null,
        pagibigNumber: null,
      });

      if (didUpdate) {
        toast.success("Government IDs cleared successfully");
        setShowEditGovernmentIdDialog(false);
      }
    });
  };

  const handleResetContactDetails = () => {
    setContactFormData(buildContactFormData(localProfile));
    toast.success("Contact form reset to saved values");
  };

  const handleResetEmploymentDetails = () => {
    setEmploymentFormData(buildEmploymentFormData(localProfile));
    toast.success("Employment form reset to saved values");
  };

  const filteredPositionOptions = employmentFormData.departmentId
    ? employmentOptions.positions.filter(
        (position) =>
          String(position.departmentId) === employmentFormData.departmentId,
      )
    : employmentOptions.positions;

  const selectedDepartmentName = employmentFormData.departmentId
    ? employmentOptions.departments.find(
        (department) =>
          String(department.departmentId) === employmentFormData.departmentId,
      )?.name
    : "";

  const formatEmploymentTypeLabel = (value: string) =>
    value
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

  const handleResetGovernmentIds = () => {
    setGovernmentIdFormData(buildGovernmentIdFormData(localProfile));
    toast.success("Government ID form reset to saved values");
  };

  const formatSssNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    if (digits.length <= 2) return digits;
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 9)}-${digits.slice(9)}`;
  };

  const formatTinNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 12);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length <= 9) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}-${digits.slice(9)}`;
  };

  const formatPhilHealthNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 12);
    if (digits.length <= 2) return digits;
    if (digits.length <= 11) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 11)}-${digits.slice(11)}`;
  };

  const formatPagIbigNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 12);
    if (digits.length <= 4) return digits;
    if (digits.length <= 8) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`;
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
    setLocalWorkingDays((prev) => ({
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

  const handleSaveProfilePicture = async () => {
    if (!profilePicturePreview) {
      toast.error("Please select an image");
      return;
    }

    await withProfileSaving(async () => {
      const didUpdate = await onUpdateProfile({
        profilePictureUrl: profilePicturePreview,
      });

      if (didUpdate) {
        toast.success("Profile picture updated successfully");
        setShowProfilePictureDialog(false);
        setProfilePicturePreview(null);
      }
    });
  };

  const handleRemoveProfilePicture = async () => {
    await withProfileSaving(async () => {
      const didUpdate = await onUpdateProfile({
        profilePictureUrl: null,
      });

      if (didUpdate) {
        toast.success("Profile picture removed");
        setShowProfilePictureDialog(false);
        setProfilePicturePreview(null);
      }
    });
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
                          ...buildContactFormData(localProfile),
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
                          ...buildEmploymentFormData(localProfile),
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
                        <p>{formatEmploymentTypeLabel(localProfile.employmentType)}</p>
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
                          ...buildGovernmentIdFormData(localProfile),
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
                      {localWorkingDays[day.key] ? (
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
                      checked={localWorkingDays[day.key]}
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
            <Button
              variant="outline"
              onClick={handleClearContactDetails}
              className="text-red-600 hover:text-red-700"
              disabled={isProfileSaving}
            >
              Clear
            </Button>
            <Button
              variant="outline"
              onClick={handleResetContactDetails}
              disabled={isProfileSaving}
            >
              Reset
            </Button>
            <Button variant="outline" onClick={() => setShowEditContactDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateContact} className="bg-vibrant-blue hover:bg-vibrant-blue/90" disabled={isProfileSaving}>
              {isProfileSaving ? "Saving..." : "Save Changes"}
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
                onValueChange={(value: any) =>
                  setEmploymentFormData({
                    ...employmentFormData,
                    employmentType: value,
                  })
                }
              >
                <SelectTrigger id="edit-employmentType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {employmentOptions.employmentTypes.map((employmentType) => (
                    <SelectItem key={employmentType} value={employmentType}>
                      {formatEmploymentTypeLabel(employmentType)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-department">Department *</Label>
              <Select
                value={employmentFormData.departmentId}
                onValueChange={(value) =>
                  setEmploymentFormData({
                    ...employmentFormData,
                    departmentId: value,
                    positionId: "",
                  })
                }
              >
                <SelectTrigger id="edit-department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {employmentOptions.departments.map((department) => (
                    <SelectItem
                      key={department.departmentId}
                      value={String(department.departmentId)}
                    >
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label htmlFor="edit-position">Position *</Label>
                {selectedDepartmentName ? (
                  <Badge className="bg-vibrant-blue/15 text-vibrant-blue hover:bg-vibrant-blue/20">
                    {selectedDepartmentName}
                  </Badge>
                ) : null}
              </div>
              <Select
                value={employmentFormData.positionId}
                onValueChange={(value) =>
                  setEmploymentFormData({
                    ...employmentFormData,
                    positionId: value,
                  })
                }
              >
                <SelectTrigger id="edit-position">
                  <SelectValue placeholder="Select position" />
                </SelectTrigger>
                <SelectContent>
                  {filteredPositionOptions.map((position) => (
                    <SelectItem key={position.positionId} value={String(position.positionId)}>
                      {position.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Button
              variant="outline"
              onClick={handleClearEmploymentDetails}
              className="text-red-600 hover:text-red-700"
              disabled={isProfileSaving}
            >
              Clear
            </Button>
            <Button
              variant="outline"
              onClick={handleResetEmploymentDetails}
              disabled={isProfileSaving}
            >
              Reset
            </Button>
            <Button variant="outline" onClick={() => setShowEditEmploymentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateEmployment} className="bg-vibrant-purple hover:bg-vibrant-purple/90" disabled={isProfileSaving}>
              {isProfileSaving ? "Saving..." : "Save Changes"}
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
                onChange={(e) =>
                  setGovernmentIdFormData({
                    ...governmentIdFormData,
                    sssNumber: formatSssNumber(e.target.value),
                  })
                }
                placeholder="XX-XXXXXXX-X"
              />
            </div>
            <div>
              <Label htmlFor="edit-tinNumber">TIN Number</Label>
              <Input
                id="edit-tinNumber"
                value={governmentIdFormData.tinNumber}
                onChange={(e) =>
                  setGovernmentIdFormData({
                    ...governmentIdFormData,
                    tinNumber: formatTinNumber(e.target.value),
                  })
                }
                placeholder="XXX-XXX-XXX-XXX"
              />
            </div>
            <div>
              <Label htmlFor="edit-philhealthNumber">PhilHealth Number</Label>
              <Input
                id="edit-philhealthNumber"
                value={governmentIdFormData.philhealthNumber}
                onChange={(e) =>
                  setGovernmentIdFormData({
                    ...governmentIdFormData,
                    philhealthNumber: formatPhilHealthNumber(e.target.value),
                  })
                }
                placeholder="XX-XXXXXXXXX-X"
              />
            </div>
            <div>
              <Label htmlFor="edit-pagibigNumber">Pag-IBIG Number</Label>
              <Input
                id="edit-pagibigNumber"
                value={governmentIdFormData.pagibigNumber}
                onChange={(e) =>
                  setGovernmentIdFormData({
                    ...governmentIdFormData,
                    pagibigNumber: formatPagIbigNumber(e.target.value),
                  })
                }
                placeholder="XXXX-XXXX-XXXX"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleClearGovernmentIds}
              className="text-red-600 hover:text-red-700"
              disabled={isProfileSaving}
            >
              Clear
            </Button>
            <Button
              variant="outline"
              onClick={handleResetGovernmentIds}
              disabled={isProfileSaving}
            >
              Reset
            </Button>
            <Button variant="outline" onClick={() => setShowEditGovernmentIdDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateGovernmentId} className="bg-vibrant-orange hover:bg-vibrant-orange/90" disabled={isProfileSaving}>
              {isProfileSaving ? "Saving..." : "Save Changes"}
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
                    disabled={isProfileSaving}
                  />
                </Label>
                
                {(localProfile.profilePicture || profilePicturePreview) && (
                  <Button
                    variant="outline"
                    onClick={handleRemoveProfilePicture}
                    className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                    disabled={isProfileSaving}
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
              disabled={isProfileSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveProfilePicture}
              disabled={!profilePicturePreview || isProfileSaving}
              className="bg-vibrant-blue hover:bg-vibrant-blue/90"
            >
              {isProfileSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

