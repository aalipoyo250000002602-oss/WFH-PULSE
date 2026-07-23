import { useState } from "react";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { motion } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Button } from "./ui/button";
import { Users, Search, ArrowUpDown, Filter, Plus, Calendar, Award } from "lucide-react";
import { getEmployees, addEmployee, Employee } from "./employee-data";
import { toast } from "sonner";

interface EmployeesCardProps {
  onEmployeeClick: (employeeId: string) => void;
}

export function EmployeesCard({ onEmployeeClick }: EmployeesCardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "department">("name");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [filterEmploymentStatus, setFilterEmploymentStatus] = useState<"all" | "onboarding" | "active" | "inactive">("active");
  const [showAddDialog, setShowAddDialog] = useState(false);
  
  // Form state for adding employee
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    department: "",
    position: "",
    joinDate: "",
    birthday: "",
    gender: "Male" as const,
    nationality: "",
    maritalStatus: "Single" as const,
    employmentType: "full-time" as const,
  });

  const employees = getEmployees();

  // Get unique departments for filter
  const departments = Array.from(
    new Set(employees.map((emp) => emp.department))
  ).sort();

  // Filter employees by search query, department, and employment status
  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch =
      searchQuery === "" ||
      emp.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.employeeId.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesDepartment =
      filterDepartment === "all" || emp.department === filterDepartment;
      
    const matchesEmploymentStatus =
      filterEmploymentStatus === "all" || emp.employmentStatus === filterEmploymentStatus;

    return matchesSearch && matchesDepartment && matchesEmploymentStatus;
  });

  // Sort employees
  const sortedEmployees = [...filteredEmployees].sort((a, b) => {
    if (sortBy === "name") {
      return `${a.lastName}, ${a.firstName}`.localeCompare(
        `${b.lastName}, ${b.firstName}`
      );
    } else {
      return a.department.localeCompare(b.department);
    }
  });

  // Limit to first 5 employees for the home page card
  const displayedEmployees = sortedEmployees.slice(0, 5);
  
  // Calculate years of service
  const calculateYearsOfService = (joinDate: string): number => {
    const today = new Date(2025, 9, 19); // Oct 19, 2025
    const join = new Date(joinDate);
    const years = today.getFullYear() - join.getFullYear();
    const monthDiff = today.getMonth() - join.getMonth();
    const dayDiff = today.getDate() - join.getDate();
    
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
      return years - 1;
    }
    return years;
  };
  
  // Check if today is work anniversary
  const isWorkAnniversary = (joinDate: string): boolean => {
    const today = new Date(2025, 9, 19); // Oct 19, 2025
    const join = new Date(joinDate);
    return join.getMonth() === today.getMonth() && join.getDate() === today.getDate();
  };

  const handleAddEmployee = () => {
    // Validate required fields
    if (!formData.firstName || !formData.lastName || !formData.email || 
        !formData.phone || !formData.department || !formData.position || 
        !formData.joinDate || !formData.birthday || !formData.nationality || !formData.employmentType) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Add employee
    const newEmployee = addEmployee({
      ...formData,
      status: "absent",
      employmentStatus: "onboarding",
      invitationSentDate: undefined,
      passwordChanged: false,
    });

    toast.success("Employee added successfully", {
      description: `${newEmployee.firstName} ${newEmployee.lastName} has been onboarded`,
    });

    // Reset form
    setFormData({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      department: "",
      position: "",
      joinDate: "",
      birthday: "",
      gender: "Male",
      nationality: "",
      maritalStatus: "Single",
      employmentType: "full-time",
    });
    
    setShowAddDialog(false);
  };

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-vibrant-purple" />
            <span className="text-sm font-medium">Quick Access</span>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAddDialog(true)}
            className="bg-vibrant-purple hover:bg-vibrant-purple/90"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
        <div className="space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search employees..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Sort and Filter Controls */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                <ArrowUpDown className="h-3 w-3" />
                Sort
              </label>
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                <Filter className="h-3 w-3" />
                Department
              </label>
              <Select
                value={filterDepartment}
                onValueChange={setFilterDepartment}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {departments.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {/* Employment Status Filter */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
              <Filter className="h-3 w-3" />
              Employment Status
            </label>
            <Select
              value={filterEmploymentStatus}
              onValueChange={(value: any) => setFilterEmploymentStatus(value)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="onboarding">Onboarding</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Employee List */}
          <div className="space-y-2">
            {displayedEmployees.length > 0 ? (
              displayedEmployees.map((employee, index) => {
                const yearsOfService = calculateYearsOfService(employee.joinDate!);
                const hasAnniversary = isWorkAnniversary(employee.joinDate!);
                
                return (
                  <motion.button
                    key={employee.id}
                    onClick={() => onEmployeeClick(employee.id)}
                    className="w-full text-left p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.05 * index }}
                  >
                    <p className="font-medium">
                      {employee.lastName}, {employee.firstName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {employee.department}
                    </p>
                    {employee.employmentStatus === "active" && employee.joinDate && (
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {yearsOfService} {yearsOfService === 1 ? "year" : "years"} of service
                        </p>
                        {hasAnniversary && (
                          <p className="text-xs text-vibrant-blue flex items-center gap-1">
                            <Award className="h-3 w-3" />
                            Work Anniversary Today! ðŸŽ‰
                          </p>
                        )}
                      </div>
                    )}
                  </motion.button>
                );
              })
            ) : (
              <motion.p 
                className="text-center text-sm text-muted-foreground py-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                No employees found
              </motion.p>
            )}
          </div>

          {/* Show count */}
          {sortedEmployees.length > 5 && (
            <p className="text-xs text-center text-muted-foreground pt-2">
              Showing 5 of {sortedEmployees.length} employees
            </p>
          )}
        </div>
      </div>

      {/* Add Employee Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Employee Onboarding</DialogTitle>
            <DialogDescription>
              Add a new employee to the system. All fields are required.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Personal Information */}
            <div className="space-y-3">
              <h4 className="font-medium">Personal Information</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="firstName">First Name *</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="John"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last Name *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="Doe"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="birthday">Birthday *</Label>
                <Input
                  id="birthday"
                  type="date"
                  value={formData.birthday}
                  onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="gender">Gender *</Label>
                  <Select
                    value={formData.gender}
                    onValueChange={(value: any) => setFormData({ ...formData, gender: value })}
                  >
                    <SelectTrigger id="gender">
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
                  <Label htmlFor="maritalStatus">Marital Status *</Label>
                  <Select
                    value={formData.maritalStatus}
                    onValueChange={(value: any) => setFormData({ ...formData, maritalStatus: value })}
                  >
                    <SelectTrigger id="maritalStatus">
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
              </div>
              
              <div>
                <Label htmlFor="nationality">Nationality *</Label>
                <Input
                  id="nationality"
                  value={formData.nationality}
                  onChange={(e) => setFormData({ ...formData, nationality: e.target.value })}
                  placeholder="American"
                />
              </div>
            </div>

            {/* Contact Information */}
            <div className="space-y-3">
              <h4 className="font-medium">Contact Information *</h4>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john.doe@company.com"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>

            {/* Employment Details */}
            <div className="space-y-3">
              <h4 className="font-medium">Employment Details *</h4>
              <div>
                <Label htmlFor="employmentType">Employment Type *</Label>
                <Select
                  value={formData.employmentType}
                  onValueChange={(value: any) => setFormData({ ...formData, employmentType: value })}
                >
                  <SelectTrigger id="employmentType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full-time">Full-Time</SelectItem>
                    <SelectItem value="independent contractor">Independent Contractor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="department">Department *</Label>
                <Input
                  id="department"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  placeholder="Engineering"
                />
              </div>
              <div>
                <Label htmlFor="position">Position *</Label>
                <Input
                  id="position"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  placeholder="Senior Developer"
                />
              </div>
              <div>
                <Label htmlFor="joinDate">Join Date *</Label>
                <Input
                  id="joinDate"
                  type="date"
                  value={formData.joinDate}
                  onChange={(e) => setFormData({ ...formData, joinDate: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddEmployee} className="bg-vibrant-purple hover:bg-vibrant-purple/90">
              Add Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

