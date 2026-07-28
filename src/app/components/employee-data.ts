// Shared employee data structure and generator

export interface Deduction {
  id: string;
  name: string;
  amount: number;
}

export interface PayrollInfo {
  governmentIds: {
    pagIbig: string;
    philHealth: string;
    sss: string;
    tin: string;
  };
  salary: number;
  deductions: Deduction[];
}

export interface Employee {
  id: string;
  employeeId: string; // Unique ID like WFP202501
  firstName: string;
  lastName: string;
  status: "present" | "on-leave" | "absent";
  employmentStatus: "onboarding" | "active" | "inactive";
  employmentType: string;
  clockInTime?: string;
  clockOutTime?: string;
  workDuration?: string;
  lateMinutes?: number;
  department: string;
  email?: string;
  phone?: string;
  position?: string;
  joinDate?: string;
  birthday?: string;
  gender?: "Male" | "Female" | "Other" | "Prefer not to say";
  nationality?: string;
  maritalStatus?: "Single" | "Married" | "Divorced" | "Widowed" | "Prefer not to say";
  address?: string;
  invitationSentDate?: string;
  passwordChanged?: boolean;
  payroll?: PayrollInfo;
  profilePicture?: string; // Base64 encoded image or URL
}

export interface EmploymentDepartmentOption {
  departmentId: number;
  name: string;
}

export interface EmploymentPositionOption {
  positionId: number;
  departmentId: number;
  name: string;
}

export interface EmploymentOptions {
  employmentTypes: string[];
  departments: EmploymentDepartmentOption[];
  positions: EmploymentPositionOption[];
}

export const getDepartmentNamesFromOptions = (
  departmentOptions: EmploymentDepartmentOption[],
): string[] => {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const option of departmentOptions) {
    const normalizedName = option.name.trim();
    if (!normalizedName) {
      continue;
    }

    const key = normalizedName.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(normalizedName);
  }

  return names;
};

export const syncEmployeesWithDepartments = (
  employees: Employee[],
  departmentOptions: EmploymentDepartmentOption[],
): Employee[] => {
  const departmentNames = getDepartmentNamesFromOptions(departmentOptions);
  if (departmentNames.length === 0) {
    return employees;
  }

  const validDepartments = new Set(
    departmentNames.map((department) => department.toLowerCase()),
  );

  return employees.map((employee, index) => {
    if (validDepartments.has(employee.department.toLowerCase())) {
      return employee;
    }

    return {
      ...employee,
      department: departmentNames[index % departmentNames.length],
    };
  });
};

const getEmploymentTypeNamesFromOptions = (employmentTypes: string[]): string[] => {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const employmentType of employmentTypes) {
    const normalized = employmentType.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(normalized);
  }

  return names;
};

const getDepartmentNameById = (departments: EmploymentDepartmentOption[]): Map<number, string> => {
  const byId = new Map<number, string>();
  for (const department of departments) {
    const name = department.name.trim();
    if (!name) {
      continue;
    }
    byId.set(department.departmentId, name);
  }
  return byId;
};

export const syncEmployeesWithEmploymentOptions = (
  employees: Employee[],
  options: EmploymentOptions,
): Employee[] => {
  const departmentNames = getDepartmentNamesFromOptions(options.departments);
  const validDepartmentNames = new Set(
    departmentNames.map((department) => department.toLowerCase()),
  );

  const employmentTypeNames = getEmploymentTypeNamesFromOptions(options.employmentTypes);
  const validEmploymentTypes = new Set(
    employmentTypeNames.map((employmentType) => employmentType.toLowerCase()),
  );

  const departmentNameById = getDepartmentNameById(options.departments);
  const positionNamesByDepartment = new Map<string, string[]>();
  const globalPositionNames: string[] = [];
  const seenGlobalPositions = new Set<string>();

  for (const position of options.positions) {
    const positionName = position.name.trim();
    if (!positionName) {
      continue;
    }

    const globalKey = positionName.toLowerCase();
    if (!seenGlobalPositions.has(globalKey)) {
      seenGlobalPositions.add(globalKey);
      globalPositionNames.push(positionName);
    }

    const departmentName = departmentNameById.get(position.departmentId);
    if (!departmentName) {
      continue;
    }

    const departmentKey = departmentName.toLowerCase();
    const existing = positionNamesByDepartment.get(departmentKey) ?? [];
    if (!existing.some((name) => name.toLowerCase() === globalKey)) {
      existing.push(positionName);
      positionNamesByDepartment.set(departmentKey, existing);
    }
  }

  return employees.map((employee, index) => {
    const syncedDepartment =
      departmentNames.length > 0 && !validDepartmentNames.has(employee.department.toLowerCase())
        ? departmentNames[index % departmentNames.length]
        : employee.department;

    const syncedEmploymentType =
      employmentTypeNames.length > 0 &&
      !validEmploymentTypes.has((employee.employmentType || "").toLowerCase())
        ? employmentTypeNames[index % employmentTypeNames.length]
        : employee.employmentType;

    const departmentPositions = positionNamesByDepartment.get(
      syncedDepartment.toLowerCase(),
    ) ?? [];
    const candidatePositions =
      departmentPositions.length > 0 ? departmentPositions : globalPositionNames;
    const validPositionNames = new Set(
      candidatePositions.map((positionName) => positionName.toLowerCase()),
    );

    const currentPosition = (employee.position || "").trim();
    const syncedPosition =
      candidatePositions.length > 0 &&
      (!currentPosition || !validPositionNames.has(currentPosition.toLowerCase()))
        ? candidatePositions[index % candidatePositions.length]
        : employee.position;

    return {
      ...employee,
      department: syncedDepartment,
      employmentType: syncedEmploymentType,
      position: syncedPosition,
    };
  });
};

// Generate 30 sample employees with enhanced data
export const generateEmployees = (): Employee[] => {
  const firstNames = [
    "John", "Sarah", "Michael", "Emma", "David", "Lisa", "James", "Maria",
    "Robert", "Jennifer", "William", "Linda", "Richard", "Patricia", "Charles",
    "Nancy", "Thomas", "Jessica", "Daniel", "Karen", "Matthew", "Betty",
    "Anthony", "Helen", "Mark", "Sandra", "Donald", "Ashley", "Steven", "Emily"
  ];
  
  const lastNames = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
    "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
    "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Thompson", "White",
    "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker"
  ];
  
  const departments = [
    "Engineering", "Marketing", "Sales", "HR", "Finance", "Operations",
    "Customer Support", "Design", "Product", "Legal"
  ];
  
  const positions = [
    "Senior Developer", "Marketing Manager", "Sales Representative", "HR Specialist", "Financial Analyst",
    "Operations Coordinator", "Support Agent", "UI/UX Designer", "Product Manager", "Legal Counsel"
  ];
  
  const clockInTimes = ["8:45 AM", "8:52 AM", "9:00 AM", "9:05 AM", "9:12 AM", "9:15 AM", "9:18 AM", "9:20 AM", "9:23 AM", "9:30 AM"];
  const clockOutTimes = ["5:30 PM", "5:45 PM", "6:00 PM", "6:15 PM", "6:30 PM"];
  const workDurations = ["8h 45m", "8h 53m", "9h 0m", "9h 10m", "9h 18m", "9h 15m"];
  
  const genders: Array<"Male" | "Female" | "Other" | "Prefer not to say"> = ["Male", "Female", "Male", "Female", "Male"];
  const nationalities = ["American", "British", "Canadian", "Australian", "German", "French", "Japanese", "Indian", "Brazilian", "Mexican"];
  const maritalStatuses: Array<"Single" | "Married" | "Divorced" | "Widowed" | "Prefer not to say"> = ["Single", "Married", "Single", "Married", "Divorced"];
  
  const addresses = [
    "123 Uso St., Toril, Davao City, 8000, Philippines",
  ];
  
  // Profile pictures for employees
  const profilePictures = [
    "https://images.unsplash.com/photo-1655249481446-25d575f1c054?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBidXNpbmVzcyUyMHBlcnNvbiUyMHBvcnRyYWl0fGVufDF8fHx8MTc2MjQzMzI3NXww&ixlib=rb-4.1.0&q=80&w=1080",
    "https://images.unsplash.com/photo-1689600944138-da3b150d9cb8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjB3b21hbiUyMGhlYWRzaG90fGVufDF8fHx8MTc2MjM5Mzc0Mnww&ixlib=rb-4.1.0&q=80&w=1080",
    "https://images.unsplash.com/photo-1672685667592-0392f458f46f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBtYW4lMjBoZWFkc2hvdHxlbnwxfHx8fDE3NjI0NzUyNzZ8MA&ixlib=rb-4.1.0&q=80&w=1080",
    "https://images.unsplash.com/photo-1629507208649-70919ca33793?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxidXNpbmVzcyUyMHByb2Zlc3Npb25hbCUyMHBvcnRyYWl0fGVufDF8fHx8MTc2MjM3NjkxOHww&ixlib=rb-4.1.0&q=80&w=1080",
    "https://images.unsplash.com/photo-1758599543120-4e462429a4d7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb3Jwb3JhdGUlMjBoZWFkc2hvdCUyMHdvbWFufGVufDF8fHx8MTc2MjQ3ODM0MHww&ixlib=rb-4.1.0&q=80&w=1080",
    "https://images.unsplash.com/photo-1568585105565-e372998a195d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb3Jwb3JhdGUlMjBoZWFkc2hvdCUyMG1hbnxlbnwxfHx8fDE3NjI0MzQ3Nzh8MA&ixlib=rb-4.1.0&q=80&w=1080",
  ];
  
  return Array.from({ length: 30 }, (_, i) => {
    const status = i < 20 ? "present" : i < 25 ? "on-leave" : "absent";
    const hasLeftWork = status === "present" && i < 10; // First 10 present employees have clocked out
    
    // Employment status: 2 onboarding (indices 27, 28), 2 inactive (indices 25, 26), rest active
    const employmentStatus = i === 27 || i === 28 ? "onboarding" : i === 25 || i === 26 ? "inactive" : "active";
    
    // 3 late employees: indices 0, 5, 10
    const isLate = status === "present" && (i === 0 || i === 5 || i === 10);
    const lateMinutes = isLate ? (i === 0 ? 15 : i === 5 ? 20 : 30) : undefined;
    
    const firstName = firstNames[i];
    const lastName = lastNames[i];
    const department = departments[i % departments.length];
    
    // Generate random payroll data
    const baseSalary = 150000 + Math.floor(Math.random() * 20000); // 150k to 170k
    const withholdingTax = Math.floor(baseSalary * 0.1); // 10% of salary
    const hdmf = 100 + Math.floor(Math.random() * 100); // 100 to 200
    const philHealth = 2100 + Math.floor(Math.random() * 900); // 2100 to 3000
    const sss = 2000 + Math.floor(Math.random() * 500); // 2000 to 2500
    
    const generateGovId = (prefix: string) => {
      return `${prefix}${Math.floor(100000000000 + Math.random() * 900000000000)}`;
    };
    
    const payrollInfo: PayrollInfo = {
      governmentIds: {
        pagIbig: "202511111111",
        philHealth: "202511111111", 
        sss: "202511111111",
        tin: "202511111111",
      },
      salary: baseSalary,
      deductions: [
        { id: `ded-${i}-1`, name: "Withholding Tax", amount: withholdingTax },
        { id: `ded-${i}-2`, name: "Employee HDMF", amount: hdmf },
        { id: `ded-${i}-3`, name: "Employee PhilHealth", amount: philHealth },
        { id: `ded-${i}-4`, name: "Employee Social Security", amount: sss },
      ],
    };
    
    // Generate birthdays - make employees 0 and 1 have birthdays today (Oct 19)
    const today = new Date(2025, 9, 19); // Oct 19, 2025
    let birthday: string;
    if (i === 0 || i === 1) {
      // Birthday today (different years)
      birthday = `19${85 + i}-10-19`;
    } else {
      birthday = `19${70 + (i % 20)}-${String(Math.floor(1 + Math.random() * 12)).padStart(2, '0')}-${String(Math.floor(1 + Math.random() * 28)).padStart(2, '0')}`;
    }
    
    // Generate join dates - make employees 2 and 3 have work anniversary today
    let joinDate: string;
    if (i === 2 || i === 3) {
      // Work anniversary today
      joinDate = `202${i === 2 ? 2 : 1}-10-19`;
    } else {
      joinDate = `202${Math.floor(1 + Math.random() * 4)}-0${Math.floor(1 + Math.random() * 9)}-${String(Math.floor(1 + Math.random() * 28)).padStart(2, '0')}`;
    }
    
    return {
      id: `emp-${i + 1}`,
      employeeId: `WFP${2025}${String(i + 1).padStart(2, '0')}`,
      firstName,
      lastName,
      status,
      employmentStatus,
      employmentType: i % 5 === 0 ? "independent contractor" : "full-time",
      clockInTime: status === "present" ? clockInTimes[i % clockInTimes.length] : undefined,
      clockOutTime: hasLeftWork ? clockOutTimes[i % clockOutTimes.length] : undefined,
      workDuration: status === "on-leave" ? "8h 0m" : hasLeftWork ? workDurations[i % workDurations.length] : undefined,
      lateMinutes,
      department,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@company.com`,
      phone: `+1 (555) ${String(Math.floor(100 + Math.random() * 900)).padStart(3, '0')}-${String(Math.floor(1000 + Math.random() * 9000)).padStart(4, '0')}`,
      position: positions[i % positions.length],
      joinDate,
      birthday,
      gender: genders[i % genders.length],
      nationality: nationalities[i % nationalities.length],
      maritalStatus: maritalStatuses[i % maritalStatuses.length],
      address: addresses[i % addresses.length],
      invitationSentDate: employmentStatus === "onboarding" && i === 27 ? "2025-10-15" : undefined,
      passwordChanged: employmentStatus === "onboarding" && i === 28 ? true : undefined,
      payroll: payrollInfo,
      profilePicture: profilePictures[i % profilePictures.length],
    };
  });
};

// Singleton instance of employees
let employeesInstance: Employee[] | null = null;

export const getEmployees = (): Employee[] => {
  if (!employeesInstance) {
    employeesInstance = generateEmployees();
  }
  return employeesInstance;
};

export const addEmployee = (employee: Omit<Employee, "id" | "employeeId">): Employee => {
  const employees = getEmployees();
  const newId = employees.length + 1;
  const newEmployee: Employee = {
    ...employee,
    id: `emp-${newId}`,
    employeeId: `WFP${2025}${String(newId).padStart(2, '0')}`,
  };
  
  employeesInstance = [...employees, newEmployee];
  return newEmployee;
};

export const updateEmployee = (id: string, updates: Partial<Employee>): Employee | null => {
  const employees = getEmployees();
  const index = employees.findIndex(emp => emp.id === id);
  
  if (index === -1) return null;
  
  const updatedEmployee = { ...employees[index], ...updates };
  employeesInstance = [
    ...employees.slice(0, index),
    updatedEmployee,
    ...employees.slice(index + 1)
  ];
  
  return updatedEmployee;
};
