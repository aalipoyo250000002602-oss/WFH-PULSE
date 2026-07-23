import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { FileText, Mail, Download, ChevronDown, Send, Plus, X } from "lucide-react";
import { Employee } from "./employee-data";
import { toast } from "sonner@2.0.3";
import { format } from "date-fns";
import logoImage from "figma:asset/80b7a2d7f7164e79d1aa41e678d57bd410cbb0ae.png";

interface EmployeeProfilePDFGeneratorProps {
  employee: Employee;
  currentUserEmail?: string;
}

export function EmployeeProfilePDFGenerator({ employee, currentUserEmail = "hr@wfhpulse.com" }: EmployeeProfilePDFGeneratorProps) {
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailTo, setEmailTo] = useState(currentUserEmail);
  const [emailCc, setEmailCc] = useState<string[]>([employee.email || ""]);
  const [newCc, setNewCc] = useState("");
  const [emailSubject, setEmailSubject] = useState(`Employee Profile - ${employee.firstName} ${employee.lastName}`);
  const [emailMessage, setEmailMessage] = useState("");
  const [logoBase64, setLogoBase64] = useState<string>("");

  // Convert logo to base64 for embedding in PDF
  useEffect(() => {
    const convertImageToBase64 = async () => {
      try {
        const response = await fetch(logoImage);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          setLogoBase64(reader.result as string);
        };
        reader.readAsDataURL(blob);
      } catch (error) {
        console.error("Failed to convert logo to base64:", error);
      }
    };
    convertImageToBase64();
  }, []);

  const generateProfilePDF = () => {
    const formatCurrency = (amount: number) => {
      return `Php ${amount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    };

    const payroll = employee.payroll;
    const govIds = payroll?.governmentIds;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Employee Profile</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              padding: 40px; 
              background: white;
              max-width: 800px;
              margin: 0 auto;
            }
            .logo-container { 
              text-align: center; 
              margin-bottom: 20px; 
            }
            .logo { 
              width: 120px; 
              height: auto;
              display: inline-block;
            }
            .header { 
              text-align: center;
              margin-bottom: 30px; 
              border-bottom: 3px solid #3b82f6; 
              padding-bottom: 20px; 
            }
            h1 { 
              color: #1e293b; 
              margin: 0 0 10px 0; 
              font-size: 32px; 
            }
            .employee-info { 
              background: #f8fafc; 
              padding: 20px; 
              border-radius: 8px; 
              margin-bottom: 25px;
              border: 1px solid #e2e8f0;
            }
            .employee-info table {
              width: 100%;
            }
            .employee-info td {
              padding: 8px 0;
              border: none;
            }
            .employee-info .label {
              color: #64748b;
              font-size: 13px;
              width: 150px;
            }
            .employee-info .value {
              color: #1e293b;
              font-weight: 500;
            }
            .section { 
              margin: 25px 0; 
              padding: 20px; 
              background: #f8fafc; 
              border-radius: 8px;
              border: 1px solid #e2e8f0;
            }
            .section h2 {
              margin: 0 0 15px 0;
              color: #1e293b;
              font-size: 18px;
              display: flex;
              align-items: center;
              gap: 10px;
            }
            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px;
            }
            .info-item {
              background: white;
              padding: 12px;
              border-radius: 6px;
            }
            .info-item .label {
              font-size: 12px;
              color: #64748b;
              margin-bottom: 4px;
            }
            .info-item .value {
              font-size: 16px;
              font-weight: bold;
              color: #1e293b;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              font-size: 13px; 
              margin: 15px 0;
              background: white;
            }
            th { 
              background: #1e293b; 
              color: white; 
              padding: 12px; 
              text-align: left; 
              font-size: 12px;
              font-weight: 600;
            }
            td { 
              padding: 12px; 
              border-bottom: 1px solid #e2e8f0; 
            }
            tr:last-child td {
              border-bottom: none;
            }
            .amount {
              text-align: right;
              font-weight: 500;
            }
            .footer { 
              margin-top: 40px; 
              padding-top: 20px;
              border-top: 2px solid #e2e8f0;
              color: #64748b; 
              font-size: 11px; 
              text-align: center;
              line-height: 1.6;
            }
            .status-badge {
              display: inline-block;
              padding: 4px 12px;
              border-radius: 4px;
              font-size: 12px;
              font-weight: 600;
              text-transform: uppercase;
            }
            .status-active {
              background: #dcfce7;
              color: #16a34a;
            }
            .status-onboarding {
              background: #dbeafe;
              color: #2563eb;
            }
            .status-inactive {
              background: #fee2e2;
              color: #dc2626;
            }
            .profile-section {
              display: flex;
              align-items: flex-start;
              gap: 20px;
              margin-bottom: 25px;
            }
            .profile-picture {
              width: 120px;
              height: 120px;
              border-radius: 50%;
              object-fit: cover;
              border: 3px solid #3b82f6;
              flex-shrink: 0;
            }
            .profile-info-wrapper {
              flex: 1;
            }
            @media print {
              body { padding: 20px; }
            }
          </style>
        </head>
        <body>
          <div class="logo-container">
            <img src="${logoBase64}" alt="WFH PULSE Logo" class="logo" />
          </div>
          
          <div class="header">
            <h1>EMPLOYEE PROFILE</h1>
          </div>
          
          <div class="profile-section">
            ${employee.profilePicture ? `
              <img src="${employee.profilePicture}" alt="${employee.firstName} ${employee.lastName}" class="profile-picture" />
            ` : ""}
            <div class="profile-info-wrapper ${!employee.profilePicture ? 'employee-info' : ''}">
              <div class="employee-info">
                <table>
                  <tr>
                    <td class="label">Employee Name:</td>
                    <td class="value">${employee.lastName}, ${employee.firstName}</td>
                    <td class="label">Employee ID:</td>
                    <td class="value">${employee.employeeId}</td>
                  </tr>
              <tr>
                <td class="label">Department:</td>
                <td class="value">${employee.department}</td>
                <td class="label">Position:</td>
                <td class="value">${employee.position || "N/A"}</td>
              </tr>
              <tr>
                <td class="label">Employment Status:</td>
                <td class="value">
                  <span class="status-badge status-${employee.employmentStatus}">
                    ${employee.employmentStatus}
                  </span>
                </td>
                <td class="label">Employment Type:</td>
                <td class="value">${employee.employmentType === "full-time" ? "Full-Time" : "Independent Contractor"}</td>
              </tr>
            </table>
          </div>
            </div>
          </div>

          <div class="section">
            <h2>Contact Information</h2>
            <div class="info-grid">
              <div class="info-item">
                <div class="label">Email</div>
                <div class="value" style="font-size: 14px;">${employee.email || "N/A"}</div>
              </div>
              <div class="info-item">
                <div class="label">Phone</div>
                <div class="value" style="font-size: 14px;">${employee.phone || "N/A"}</div>
              </div>
              <div class="info-item">
                <div class="label">Birthday</div>
                <div class="value" style="font-size: 14px;">${employee.birthday ? format(new Date(employee.birthday), "MMMM dd, yyyy") : "N/A"}</div>
              </div>
              <div class="info-item">
                <div class="label">Gender</div>
                <div class="value" style="font-size: 14px;">${employee.gender || "N/A"}</div>
              </div>
              <div class="info-item">
                <div class="label">Nationality</div>
                <div class="value" style="font-size: 14px;">${employee.nationality || "N/A"}</div>
              </div>
              <div class="info-item">
                <div class="label">Marital Status</div>
                <div class="value" style="font-size: 14px;">${employee.maritalStatus || "N/A"}</div>
              </div>
            </div>
            ${employee.address ? `
            <div class="info-item" style="margin-top: 15px;">
              <div class="label">Address</div>
              <div class="value" style="font-size: 14px;">${employee.address}</div>
            </div>
            ` : ""}
          </div>

          <div class="section">
            <h2>Employment Details</h2>
            <div class="info-grid">
              <div class="info-item">
                <div class="label">Employment Type</div>
                <div class="value" style="font-size: 14px;">${employee.employmentType === "full-time" ? "Full-Time" : "Independent Contractor"}</div>
              </div>
              <div class="info-item">
                <div class="label">Department</div>
                <div class="value" style="font-size: 14px;">${employee.department}</div>
              </div>
              <div class="info-item">
                <div class="label">Position</div>
                <div class="value" style="font-size: 14px;">${employee.position || "N/A"}</div>
              </div>
              <div class="info-item">
                <div class="label">Join Date</div>
                <div class="value" style="font-size: 14px;">${employee.joinDate ? format(new Date(employee.joinDate), "MMMM dd, yyyy") : "N/A"}</div>
              </div>
            </div>
          </div>

          ${payroll ? `
          <div class="section">
            <h2>Payroll Details</h2>
            <div class="info-grid">
              <div class="info-item">
                <div class="label">Monthly Salary</div>
                <div class="value">${formatCurrency(payroll.salary)}</div>
              </div>
              <div class="info-item">
                <div class="label">Daily Rate</div>
                <div class="value">${formatCurrency(payroll.salary / 22)}</div>
              </div>
            </div>

            ${govIds ? `
            <h3 style="margin: 20px 0 15px 0; font-size: 16px; color: #1e293b;">Government IDs</h3>
            <div class="info-grid">
              <div class="info-item">
                <div class="label">TIN</div>
                <div class="value" style="font-size: 14px;">${govIds.tin}</div>
              </div>
              <div class="info-item">
                <div class="label">SSS No.</div>
                <div class="value" style="font-size: 14px;">${govIds.sss}</div>
              </div>
              <div class="info-item">
                <div class="label">PhilHealth No.</div>
                <div class="value" style="font-size: 14px;">${govIds.philHealth}</div>
              </div>
              <div class="info-item">
                <div class="label">Pag-IBIG No.</div>
                <div class="value" style="font-size: 14px;">${govIds.pagIbig}</div>
              </div>
            </div>
            ` : ""}

            ${payroll.deductions && payroll.deductions.length > 0 ? `
            <h3 style="margin: 20px 0 15px 0; font-size: 16px; color: #1e293b;">Payroll Deductions</h3>
            <table>
              <thead>
                <tr>
                  <th>Deduction Name</th>
                  <th style="text-align: right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${payroll.deductions
                  .map(
                    (d) => `
                  <tr>
                    <td>${d.name}</td>
                    <td class="amount">${formatCurrency(d.amount)}</td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
            ` : ""}
          </div>
          ` : ""}

          <div class="footer">
            Generated on ${format(new Date(), "MMMM dd, yyyy 'at' h:mm a")}<br>
            This is an automatically generated employee profile from WFH PULSE.
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
      toast.success("Employee profile PDF opened in new window");
    } else {
      toast.error("Please allow popups to export PDF");
    }
  };

  const handleAddCc = () => {
    if (!newCc) return;
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newCc)) {
      toast.error("Please enter a valid email address");
      return;
    }

    if (emailCc.includes(newCc)) {
      toast.error("This email is already in CC list");
      return;
    }

    setEmailCc([...emailCc, newCc]);
    setNewCc("");
  };

  const handleRemoveCc = (index: number) => {
    setEmailCc(emailCc.filter((_, i) => i !== index));
  };

  const handleSendEmail = () => {
    if (!emailTo || !emailSubject || !emailMessage) {
      toast.error("Please fill in all required fields");
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTo)) {
      toast.error("Please enter a valid recipient email address");
      return;
    }

    // Simulate sending email
    const ccText = emailCc.filter(email => email).length > 0 
      ? ` (CC: ${emailCc.filter(email => email).join(", ")})`
      : "";
    
    toast.success(`Profile sent to ${emailTo}${ccText}`, {
      description: "The employee profile has been sent via email.",
    });

    setShowEmailDialog(false);
    setEmailMessage("");
    setEmailCc([employee.email || ""]);
    setNewCc("");
  };

  const getDefaultEmailMessage = () => {
    return `Dear Team,

I hope this email finds you well.

Please find attached the employee profile for ${employee.firstName} ${employee.lastName} (${employee.employeeId}). This document contains comprehensive employment information, contact details, and payroll information on file.

Please review the details for your records. If you notice any discrepancies or need to update any information, please contact the HR department.

Thank you.

Best regards,
HR Department
WFH PULSE`;
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Profile</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={generateProfilePDF}>
            <Download className="h-4 w-4 mr-2" />
            Generate PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => {
            setEmailMessage(getDefaultEmailMessage());
            setShowEmailDialog(true);
          }}>
            <Mail className="h-4 w-4 mr-2" />
            Send via Email
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Email Dialog */}
      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-vibrant-blue" />
              Send Employee Profile via Email
            </DialogTitle>
            <DialogDescription>
              Compose and send the employee profile via email
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="email-to">To <span className="text-red-500">*</span></Label>
              <Input
                id="email-to"
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="Enter recipient email"
              />
            </div>

            <div>
              <Label htmlFor="email-cc">CC</Label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    id="email-cc"
                    type="email"
                    value={newCc}
                    onChange={(e) => setNewCc(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCc();
                      }
                    }}
                    placeholder="Add CC email"
                  />
                  <Button 
                    type="button" 
                    size="icon" 
                    variant="outline"
                    onClick={handleAddCc}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                
                {emailCc.filter(email => email).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {emailCc.filter(email => email).map((email, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-sm"
                      >
                        <span>{email}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCc(index)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="email-subject">Subject <span className="text-red-500">*</span></Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Enter email subject"
              />
            </div>

            <div>
              <Label htmlFor="email-message">Message <span className="text-red-500">*</span></Label>
              <Textarea
                id="email-message"
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                placeholder="Enter your message"
                rows={10}
                className="font-mono text-sm"
              />
            </div>

            <div className="bg-muted/50 p-3 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Attachment:</strong> Employee_Profile_{employee.employeeId}.pdf
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendEmail}
              className="bg-vibrant-blue hover:bg-vibrant-blue/90"
            >
              <Send className="h-4 w-4 mr-2" />
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
