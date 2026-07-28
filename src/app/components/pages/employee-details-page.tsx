import { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { Switch } from "../ui/switch";
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Briefcase,
  Calendar,
  Clock,
  Building2,
  AlertCircle,
  Send,
  Edit,
  CheckCircle,
  UserCheck,
  UserX,
  Cake,
  Globe,
  Heart,
  IdCard,
  ChevronDown,
  ChevronUp,
  DollarSign,
  MapPin,
} from "lucide-react";
import {
  getEmployees,
  updateEmployee,
  Employee,
  PayrollInfo,
  getDepartmentNamesFromOptions,
  syncEmployeesWithDepartments,
} from "../employee-data";
import { toast } from "sonner";
import { EmployeePayrollCard } from "../employee-payroll-card";
import { EmployeeProfilePDFGenerator } from "../employee-profile-pdf-generator";

interface EmployeeDetailsPageProps {
  employeeId: string;
  departmentOptions: Array<{ departmentId: number; name: string }>;
  onBack: () => void;
}

export function EmployeeDetailsPage({
  employeeId,
  departmentOptions,
  onBack,
}: EmployeeDetailsPageProps) {
  const employees = useMemo(
    () => syncEmployeesWithDepartments(getEmployees(), departmentOptions),
    [departmentOptions],
  );
  const departmentNames = useMemo(
    () => getDepartmentNamesFromOptions(departmentOptions),
    [departmentOptions],
  );
  const [employee, setEmployee] = useState(employees.find((emp) => emp.id === employeeId));
  const [showEditContactDialog, setShowEditContactDialog] = useState(false);
  const [showEditEmploymentDialog, setShowEditEmploymentDialog] = useState(false);
  const [showStatusChangeDialog, setShowStatusChangeDialog] = useState(false);
  const [targetStatus, setTargetStatus] = useState<"active" | "inactive" | null>(null);
  const [showProfilePictureDialog, setShowProfilePictureDialog] = useState(false);
  const [profilePicturePreview, setProfilePicturePreview] = useState<string | null>(null);
  
  // Collapsible states - default to closed
  const [isContactOpen, setIsContactOpen] = useState(false);
  const [isEmploymentOpen, setIsEmploymentOpen] = useState(false);
  const [isPayrollOpen, setIsPayrollOpen] = useState(false);

  // Edit form states
  const [contactFormData, setContactFormData] = useState({
    email: employee?.email || "",
    phone: employee?.phone || "",
    birthday: employee?.birthday || "",
    gender: employee?.gender || "Male",
    nationality: employee?.nationality || "",
    maritalStatus: employee?.maritalStatus || "Single",
    address: employee?.address || "",
  });

  const [employmentFormData, setEmploymentFormData] = useState({
    employmentType: employee?.employmentType || "full-time",
    department: employee?.department || "",
    position: employee?.position || "",
    joinDate: employee?.joinDate || "",
  });

  useEffect(() => {
    const refreshedEmployee = employees.find((emp) => emp.id === employeeId);
    if (refreshedEmployee) {
      setEmployee(refreshedEmployee);
    }
  }, [employeeId, employees]);

  if (!employee) {
    return (
      <div className="space-y-6 pb-20">
        <div className="px-4">
          <Button
            onClick={onBack}
            variant="ghost"
            className="mb-4 -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Card>
            <CardContent className="p-6 text-center">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">Employee not found</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: Employee["status"]) => {
    switch (status) {
      case "present":
        return "bg-vibrant-green text-vibrant-green-foreground";
      case "on-leave":
        return "bg-vibrant-orange text-vibrant-orange-foreground";
      case "absent":
        return "bg-destructive text-destructive-foreground";
    }
  };

  const getStatusText = (status: Employee["status"]) => {
    switch (status) {
      case "present":
        return "Present";
      case "on-leave":
        return "On Leave";
      case "absent":
        return "Absent";
    }
  };

  const getEmploymentStatusColor = (status: Employee["employmentStatus"]) => {
    switch (status) {
      case "active":
        return "bg-vibrant-green/20 text-vibrant-green";
      case "onboarding":
        return "bg-vibrant-blue/20 text-vibrant-blue";
      case "inactive":
        return "bg-muted-foreground/20 text-muted-foreground";
    }
  };

  const calculateYearsOfService = (joinDate: string): number => {
    const today = new Date(2025, 9, 19);
    const join = new Date(joinDate);
    const years = today.getFullYear() - join.getFullYear();
    const monthDiff = today.getMonth() - join.getMonth();
    const dayDiff = today.getDate() - join.getDate();
    
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
      return years - 1;
    }
    return years;
  };

  const isWorkAnniversary = (joinDate: string): boolean => {
    const today = new Date(2025, 9, 19);
    const join = new Date(joinDate);
    return join.getMonth() === today.getMonth() && join.getDate() === today.getDate();
  };

  const handleSendInvitation = () => {
    const updated = updateEmployee(employee.id, {
      invitationSentDate: new Date().toISOString().split('T')[0],
    });
    
    if (updated) {
      setEmployee(updated);
      toast.success("Invitation sent successfully", {
        description: `An invitation email has been sent to ${employee.email}`,
      });
    }
  };

  const handleUpdateContact = () => {
    if (!contactFormData.email || !contactFormData.phone || !contactFormData.birthday || !contactFormData.nationality || !contactFormData.address) {
      toast.error("Please fill in all required fields");
      return;
    }

    const updated = updateEmployee(employee.id, contactFormData);
    if (updated) {
      setEmployee(updated);
      toast.success("Contact information updated successfully");
      setShowEditContactDialog(false);
    }
  };

  const handleUpdateEmployment = () => {
    if (!employmentFormData.employmentType || !employmentFormData.department || !employmentFormData.position || !employmentFormData.joinDate) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (
      departmentNames.length > 0 &&
      !departmentNames.includes(employmentFormData.department)
    ) {
      toast.error("Please select a valid department from employment details");
      return;
    }

    const updated = updateEmployee(employee.id, employmentFormData);
    if (updated) {
      setEmployee(updated);
      toast.success("Employment details updated successfully");
      setShowEditEmploymentDialog(false);
    }
  };

  const handleStatusChange = () => {
    if (!targetStatus) return;

    const updated = updateEmployee(employee.id, {
      employmentStatus: targetStatus,
    });

    if (updated) {
      setEmployee(updated);
      toast.success(`Employee status changed to ${targetStatus}`);
      setShowStatusChangeDialog(false);
      setTargetStatus(null);
    }
  };

  const handleUpdatePayroll = (payroll: PayrollInfo) => {
    const updated = updateEmployee(employee.id, { payroll });
    if (updated) {
      setEmployee(updated);
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

    const updated = updateEmployee(employee.id, {
      profilePicture: profilePicturePreview,
    });

    if (updated) {
      setEmployee(updated);
      toast.success("Profile picture updated successfully");
      setShowProfilePictureDialog(false);
      setProfilePicturePreview(null);
    }
  };

  const handleRemoveProfilePicture = () => {
    const updated = updateEmployee(employee.id, {
      profilePicture: undefined,
    });

    if (updated) {
      setEmployee(updated);
      toast.success("Profile picture removed");
      setShowProfilePictureDialog(false);
      setProfilePicturePreview(null);
    }
  };

  const canChangeToInactive = () => {
    return employee.employmentStatus === "active";
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="px-4 space-y-4">
        {/* Back Button and Profile Actions */}
        <div className="flex items-center justify-between">
          <Button
            onClick={onBack}
            variant="ghost"
            className="-ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          <EmployeeProfilePDFGenerator employee={employee} />
        </div>

        {/* Employee Header with Employment Status */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  {employee.profilePicture ? (
                    <img
                      src={employee.profilePicture}
                      alt={`${employee.firstName} ${employee.lastName}`}
                      className="h-16 w-16 rounded-full object-cover border-2 border-vibrant-blue"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-full bg-vibrant-blue/10 flex items-center justify-center">
                      <User className="h-8 w-8 text-vibrant-blue" />
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setProfilePicturePreview(employee.profilePicture || null);
                      setShowProfilePictureDialog(true);
                    }}
                    className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-vibrant-blue text-white flex items-center justify-center hover:bg-vibrant-blue/90 transition-colors"
                  >
                    <Edit className="h-3 w-3" />
                  </button>
                </div>
                <div>
                  <h2>
                    {employee.firstName} {employee.lastName}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {employee.position}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <IdCard className="h-3 w-3" />
                    {employee.employeeId}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                {/* Only show attendance status if employment status is active */}
                {employee.employmentStatus === "active" && (
                  <Badge className={getStatusColor(employee.status)}>
                    {getStatusText(employee.status)}
                  </Badge>
                )}
                <Badge className={getEmploymentStatusColor(employee.employmentStatus)}>
                  {employee.employmentStatus}
                </Badge>
              </div>
            </div>
          </CardHeader>

          {/* Employment Status Management - Onboarding */}
          {employee.employmentStatus === "onboarding" && (
            <CardContent className="space-y-4 border-t pt-4">
              <div className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-vibrant-blue" />
                <h3 className="font-medium">Onboarding Status</h3>
              </div>
              
              <Button
                onClick={handleSendInvitation}
                disabled={!!employee.invitationSentDate || !!employee.passwordChanged}
                className="w-full bg-vibrant-blue hover:bg-vibrant-blue/90"
              >
                <Send className="h-4 w-4 mr-2" />
                Send Invitation Link
              </Button>

              {/* Invitation Logs */}
              <div className="space-y-2">
                {employee.invitationSentDate && (
                  <div className="flex items-start gap-2 p-2 rounded bg-muted/50">
                    <CheckCircle className="h-4 w-4 text-vibrant-green mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm">Invitation sent</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(employee.invitationSentDate).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                )}
                {employee.passwordChanged && (
                  <div className="flex items-start gap-2 p-2 rounded bg-vibrant-green/10">
                    <CheckCircle className="h-4 w-4 text-vibrant-green mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-vibrant-green">
                      Employee already changed password
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          )}

          {/* Employment Status Management - Active */}
          {employee.employmentStatus === "active" && (
            <CardContent className="border-t pt-4">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <UserCheck className="h-5 w-5 text-vibrant-green" />
                  <div>
                    <p className="font-medium">Active Status</p>
                    <p className="text-sm text-muted-foreground">Employee is currently active</p>
                  </div>
                </div>
                <Switch
                  checked={true}
                  onCheckedChange={(checked) => {
                    if (!checked) {
                      setTargetStatus("inactive");
                      setShowStatusChangeDialog(true);
                    }
                  }}
                />
              </div>
            </CardContent>
          )}

          {/* Employment Status Management - Inactive */}
          {employee.employmentStatus === "inactive" && (
            <CardContent className="border-t pt-4">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-3">
                  <UserX className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Inactive Status</p>
                    <p className="text-sm text-muted-foreground">Employee is currently inactive</p>
                  </div>
                </div>
                <Switch
                  checked={false}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setTargetStatus("active");
                      setShowStatusChangeDialog(true);
                    }
                  }}
                />
              </div>
            </CardContent>
          )}
        </Card>

        {/* Today's Attendance */}
        {employee.status === "present" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-vibrant-green" />
                Today's Attendance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-sm text-muted-foreground mb-1">
                    Clock-In
                  </p>
                  <p className="font-medium">{employee.clockInTime}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30">
                  <p className="text-sm text-muted-foreground mb-1">
                    Clock-Out
                  </p>
                  <p className="font-medium">
                    {employee.clockOutTime || (
                      <span className="text-vibrant-green">Active</span>
                    )}
                  </p>
                </div>
              </div>
              {employee.workDuration && (
                <div className="p-3 rounded-lg bg-vibrant-blue/10">
                  <p className="text-sm text-muted-foreground mb-1">
                    Work Duration
                  </p>
                  <p className="font-medium text-vibrant-blue">
                    {employee.workDuration}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Leave Status */}
        {employee.status === "on-leave" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-vibrant-orange" />
                Leave Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="p-4 rounded-lg bg-vibrant-orange/10 text-center">
                <p className="text-vibrant-orange">
                  Employee is currently on leave
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Contact Information - Collapsible */}
        <Collapsible open={isContactOpen} onOpenChange={setIsContactOpen}>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CollapsibleTrigger className="flex items-center gap-2 flex-1">
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-vibrant-blue" />
                    Contact Information
                  </CardTitle>
                  {isContactOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </CollapsibleTrigger>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!isContactOpen}
                  onClick={() => {
                    setContactFormData({
                      email: employee.email || "",
                      phone: employee.phone || "",
                      birthday: employee.birthday || "",
                      gender: employee.gender || "Male",
                      nationality: employee.nationality || "",
                      maritalStatus: employee.maritalStatus || "Single",
                      address: employee.address || "",
                    });
                    setShowEditContactDialog(true);
                  }}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <Mail className="h-4 w-4 text-vibrant-blue mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="break-all">{employee.email}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="h-4 w-4 text-vibrant-green mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p>{employee.phone}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Cake className="h-4 w-4 text-vibrant-purple mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Birthday</p>
                    <p>
                      {employee.birthday && new Date(employee.birthday).toLocaleDateString("en-US", {
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
                    <p>{employee.gender}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Globe className="h-4 w-4 text-vibrant-blue mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Nationality</p>
                    <p>{employee.nationality}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Heart className="h-4 w-4 text-destructive mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Marital Status</p>
                    <p>{employee.maritalStatus}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-vibrant-green mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Address</p>
                    <p>{employee.address || "No address provided"}</p>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Employment Details - Collapsible */}
        <Collapsible open={isEmploymentOpen} onOpenChange={setIsEmploymentOpen}>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CollapsibleTrigger className="flex items-center gap-2 flex-1">
                  <CardTitle className="flex items-center gap-2">
                    <Briefcase className="h-5 w-5 text-vibrant-purple" />
                    Employment Details
                  </CardTitle>
                  {isEmploymentOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </CollapsibleTrigger>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!isEmploymentOpen}
                  onClick={() => {
                    setEmploymentFormData({
                      employmentType: employee.employmentType || "full-time",
                      department: employee.department || "",
                      position: employee.position || "",
                      joinDate: employee.joinDate || "",
                    });
                    setShowEditEmploymentDialog(true);
                  }}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <Briefcase className="h-4 w-4 text-vibrant-purple mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Employment Type</p>
                    <p className="capitalize">{employee.employmentType}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Building2 className="h-4 w-4 text-vibrant-orange mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Department</p>
                    <p>{employee.department}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <IdCard className="h-4 w-4 text-vibrant-blue mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Position</p>
                    <p>{employee.position}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-vibrant-green mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Join Date</p>
                    <p>
                      {employee.joinDate && new Date(employee.joinDate).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </div>
                {employee.employmentStatus === "active" && employee.joinDate && (
                  <div className="flex items-start gap-3">
                    <Clock className="h-4 w-4 text-vibrant-purple mt-0.5" />
                    <div>
                      <p className="text-sm text-muted-foreground">Years of Service</p>
                      <p>
                        {calculateYearsOfService(employee.joinDate)} {calculateYearsOfService(employee.joinDate) === 1 ? "year" : "years"}
                      </p>
                      {isWorkAnniversary(employee.joinDate) && (
                        <Badge className="mt-1 bg-vibrant-blue/20 text-vibrant-blue">
                          Work Anniversary Today! ðŸŽ‰
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Payroll - Collapsible */}
        <EmployeePayrollCard 
          payroll={employee.payroll} 
          onUpdate={handleUpdatePayroll}
          isOpen={isPayrollOpen}
          onOpenChange={setIsPayrollOpen}
        />
      </div>

      {/* Edit Contact Information Dialog */}
      <Dialog open={showEditContactDialog} onOpenChange={setShowEditContactDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Contact Information</DialogTitle>
            <DialogDescription>
              Update employee contact details
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
              Update employee employment information
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
              <Select
                value={employmentFormData.department}
                onValueChange={(value) =>
                  setEmploymentFormData({ ...employmentFormData, department: value })
                }
              >
                <SelectTrigger id="edit-department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departmentNames.map((department) => (
                    <SelectItem key={department} value={department}>
                      {department}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      {/* Status Change Confirmation Dialog */}
      <AlertDialog open={showStatusChangeDialog} onOpenChange={setShowStatusChangeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change this employee's status to{" "}
              <span className="font-medium">{targetStatus}</span>? This action will update their employment status.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTargetStatus(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleStatusChange}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              ) : employee.profilePicture ? (
                <img
                  src={employee.profilePicture}
                  alt={`${employee.firstName} ${employee.lastName}`}
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
                
                {(employee.profilePicture || profilePicturePreview) && (
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

