import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import {
  Wallet,
  Eye,
  EyeOff,
  Edit,
  Plus,
  Trash2,
  DollarSign,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { PayrollInfo, Deduction } from "./employee-data";
import { toast } from "sonner";
import { Separator } from "./ui/separator";

interface EmployeePayrollCardProps {
  payroll: PayrollInfo | undefined;
  onUpdate: (payroll: PayrollInfo) => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function EmployeePayrollCard({ payroll, onUpdate, isOpen = true, onOpenChange }: EmployeePayrollCardProps) {
  // Visibility states
  const [showPagIbig, setShowPagIbig] = useState(false);
  const [showPhilHealth, setShowPhilHealth] = useState(false);
  const [showSSS, setShowSSS] = useState(false);
  const [showTIN, setShowTIN] = useState(false);
  const [showSalary, setShowSalary] = useState(false);
  const [showDailyRate, setShowDailyRate] = useState(false);
  const [showHourlyRate, setShowHourlyRate] = useState(false);
  const [visibleDeductions, setVisibleDeductions] = useState<Set<string>>(new Set());
  const [showTotalDeductions, setShowTotalDeductions] = useState(false);
  const [showNetSalary, setShowNetSalary] = useState(false);

  // Dialog states
  const [showEditGovIdDialog, setShowEditGovIdDialog] = useState(false);
  const [showEditDeductionDialog, setShowEditDeductionDialog] = useState(false);
  const [showAddDeductionDialog, setShowAddDeductionDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deductionToDelete, setDeductionToDelete] = useState<string | null>(null);

  // Form states
  const [govIdFormData, setGovIdFormData] = useState({
    pagIbig: payroll?.governmentIds.pagIbig || "",
    philHealth: payroll?.governmentIds.philHealth || "",
    sss: payroll?.governmentIds.sss || "",
    tin: payroll?.governmentIds.tin || "",
  });

  const [editingDeduction, setEditingDeduction] = useState<Deduction | null>(null);
  const [deductionFormData, setDeductionFormData] = useState({
    name: "",
    amount: 0,
  });

  if (!payroll) {
    return null;
  }

  const dailyRate = payroll.salary / 21;
  const hourlyRate = dailyRate / 8;

  const maskValue = (value: string) => {
    const compactLength = value.replace(/[\s-]/g, "").length;
    const maskLength = Math.max(8, Math.min(12, compactLength || 8));
    return "*".repeat(maskLength);
  };

  const renderMaskedToken = (mask = "******") => (
    <span className="inline-flex rounded-md bg-muted px-2 py-0.5 font-mono text-xs tracking-[0.28em] text-muted-foreground">
      {mask}
    </span>
  );

  const formatCurrency = (amount: number) => {
    return `Php ${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const toggleDeductionVisibility = (id: string) => {
    const newVisible = new Set(visibleDeductions);
    if (newVisible.has(id)) {
      newVisible.delete(id);
    } else {
      newVisible.add(id);
    }
    setVisibleDeductions(newVisible);
  };

  const handleUpdateGovIds = () => {
    if (!govIdFormData.pagIbig || !govIdFormData.philHealth || !govIdFormData.sss || !govIdFormData.tin) {
      toast.error("Please fill in all government ID fields");
      return;
    }

    onUpdate({
      ...payroll,
      governmentIds: govIdFormData,
    });

    toast.success("Government IDs updated successfully");
    setShowEditGovIdDialog(false);
  };

  const handleEditDeduction = (deduction: Deduction) => {
    setEditingDeduction(deduction);
    setDeductionFormData({
      name: deduction.name,
      amount: deduction.amount,
    });
    setShowEditDeductionDialog(true);
  };

  const handleUpdateDeduction = () => {
    if (!deductionFormData.name || deductionFormData.amount <= 0) {
      toast.error("Please provide a valid name and amount");
      return;
    }

    const updatedDeductions = payroll.deductions.map((d) =>
      d.id === editingDeduction?.id
        ? { ...d, name: deductionFormData.name, amount: deductionFormData.amount }
        : d
    );

    onUpdate({
      ...payroll,
      deductions: updatedDeductions,
    });

    toast.success("Deduction updated successfully");
    setShowEditDeductionDialog(false);
    setEditingDeduction(null);
  };

  const handleAddDeduction = () => {
    if (!deductionFormData.name || deductionFormData.amount <= 0) {
      toast.error("Please provide a valid name and amount");
      return;
    }

    const newDeduction: Deduction = {
      id: `ded-custom-${Date.now()}`,
      name: deductionFormData.name,
      amount: deductionFormData.amount,
    };

    onUpdate({
      ...payroll,
      deductions: [...payroll.deductions, newDeduction],
    });

    toast.success("Deduction added successfully");
    setShowAddDeductionDialog(false);
    setDeductionFormData({ name: "", amount: 0 });
  };

  const handleDeleteDeduction = () => {
    if (!deductionToDelete) return;

    const updatedDeductions = payroll.deductions.filter((d) => d.id !== deductionToDelete);

    onUpdate({
      ...payroll,
      deductions: updatedDeductions,
    });

    toast.success("Deduction deleted successfully");
    setShowDeleteDialog(false);
    setDeductionToDelete(null);
  };

  const totalDeductions = payroll.deductions.reduce((sum, d) => sum + d.amount, 0);
  const netSalary = payroll.salary - totalDeductions;

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={onOpenChange}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CollapsibleTrigger className="flex items-center gap-2 flex-1">
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-vibrant-green" />
                  Payroll
                </CardTitle>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-6">
          {/* Government IDs Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">Government ID No.</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setGovIdFormData({
                    pagIbig: payroll.governmentIds.pagIbig,
                    philHealth: payroll.governmentIds.philHealth,
                    sss: payroll.governmentIds.sss,
                    tin: payroll.governmentIds.tin,
                  });
                  setShowEditGovIdDialog(true);
                }}
                className="flex-shrink-0"
              >
                <Edit className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Pag-IBIG No.</p>
                  <p className="font-mono text-sm break-all">
                    {showPagIbig
                      ? payroll.governmentIds.pagIbig
                      : renderMaskedToken(maskValue(payroll.governmentIds.pagIbig))}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPagIbig(!showPagIbig)}
                  className="flex-shrink-0"
                >
                  {showPagIbig ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">PhilHealth No.</p>
                  <p className="font-mono text-sm break-all">
                    {showPhilHealth
                      ? payroll.governmentIds.philHealth
                      : renderMaskedToken(maskValue(payroll.governmentIds.philHealth))}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPhilHealth(!showPhilHealth)}
                  className="flex-shrink-0"
                >
                  {showPhilHealth ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">SSS No.</p>
                  <p className="font-mono text-sm break-all">
                    {showSSS
                      ? payroll.governmentIds.sss
                      : renderMaskedToken(maskValue(payroll.governmentIds.sss))}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSSS(!showSSS)}
                  className="flex-shrink-0"
                >
                  {showSSS ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Tax No.</p>
                  <p className="font-mono text-sm break-all">
                    {showTIN
                      ? payroll.governmentIds.tin
                      : renderMaskedToken(maskValue(payroll.governmentIds.tin))}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowTIN(!showTIN)}
                  className="flex-shrink-0"
                >
                  {showTIN ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {/* Salary Information */}
          <div>
            <h3 className="font-medium mb-3">Salary Information</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-vibrant-green/10">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Monthly Salary</p>
                  <p className="font-medium text-vibrant-green break-words">
                    {showSalary ? formatCurrency(payroll.salary) : renderMaskedToken()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowSalary(!showSalary)}
                  className="flex-shrink-0"
                >
                  {showSalary ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Daily Rate</p>
                  <p className="font-medium break-words">
                    {showDailyRate ? formatCurrency(dailyRate) : renderMaskedToken()}
                  </p>
                  <p className="text-xs text-muted-foreground">Salary / 21 days</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowDailyRate(!showDailyRate)}
                  className="flex-shrink-0"
                >
                  {showDailyRate ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-muted-foreground">Hourly Rate</p>
                  <p className="font-medium break-words">
                    {showHourlyRate ? formatCurrency(hourlyRate) : renderMaskedToken()}
                  </p>
                  <p className="text-xs text-muted-foreground">Daily Rate / 8 hours</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowHourlyRate(!showHourlyRate)}
                  className="flex-shrink-0"
                >
                  {showHourlyRate ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {/* Deductions Section */}
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-medium">Deductions</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDeductionFormData({ name: "", amount: 0 });
                  setShowAddDeductionDialog(true);
                }}
                className="text-vibrant-blue border-vibrant-blue hover:bg-vibrant-blue/10 flex-shrink-0"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {payroll.deductions.map((deduction) => (
                <div
                  key={deduction.id}
                  className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/30"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{deduction.name}</p>
                    <p className="text-sm font-medium text-destructive break-words">
                      {visibleDeductions.has(deduction.id)
                        ? `- ${formatCurrency(deduction.amount)}`
                        : "- ******"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleDeductionVisibility(deduction.id)}
                      className="h-8 w-8"
                    >
                      {visibleDeductions.has(deduction.id) ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEditDeduction(deduction)}
                      className="h-8 w-8"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setDeductionToDelete(deduction.id);
                        setShowDeleteDialog(true);
                      }}
                      className="h-8 w-8"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Summary */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground flex-shrink-0">Total Deductions</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-destructive font-medium break-words">
                  {showTotalDeductions ? `- ${formatCurrency(totalDeductions)}` : "- ******"}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => setShowTotalDeductions(!showTotalDeductions)}
                >
                  {showTotalDeductions ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-vibrant-blue/10">
              <span className="font-medium flex-shrink-0">Net Salary</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="font-medium text-vibrant-blue break-words">
                  {showNetSalary ? formatCurrency(netSalary) : renderMaskedToken()}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowNetSalary(!showNetSalary)}
                  className="flex-shrink-0"
                >
                  {showNetSalary ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Edit Government IDs Dialog */}
      <Dialog open={showEditGovIdDialog} onOpenChange={setShowEditGovIdDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Government IDs</DialogTitle>
            <DialogDescription>
              Update employee government identification numbers
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-pagibig">Pag-IBIG No. *</Label>
              <Input
                id="edit-pagibig"
                value={govIdFormData.pagIbig}
                onChange={(e) => setGovIdFormData({ ...govIdFormData, pagIbig: e.target.value })}
                placeholder="202511111111"
              />
            </div>
            <div>
              <Label htmlFor="edit-philhealth">PhilHealth No. *</Label>
              <Input
                id="edit-philhealth"
                value={govIdFormData.philHealth}
                onChange={(e) => setGovIdFormData({ ...govIdFormData, philHealth: e.target.value })}
                placeholder="202511111111"
              />
            </div>
            <div>
              <Label htmlFor="edit-sss">SSS No. *</Label>
              <Input
                id="edit-sss"
                value={govIdFormData.sss}
                onChange={(e) => setGovIdFormData({ ...govIdFormData, sss: e.target.value })}
                placeholder="202511111111"
              />
            </div>
            <div>
              <Label htmlFor="edit-tin">Tax No. (TIN) *</Label>
              <Input
                id="edit-tin"
                value={govIdFormData.tin}
                onChange={(e) => setGovIdFormData({ ...govIdFormData, tin: e.target.value })}
                placeholder="202511111111"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditGovIdDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateGovIds} className="bg-vibrant-blue hover:bg-vibrant-blue/90">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Deduction Dialog */}
      <Dialog open={showEditDeductionDialog} onOpenChange={setShowEditDeductionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Deduction</DialogTitle>
            <DialogDescription>
              Update deduction details
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-deduction-name">Deduction Name *</Label>
              <Input
                id="edit-deduction-name"
                value={deductionFormData.name}
                onChange={(e) => setDeductionFormData({ ...deductionFormData, name: e.target.value })}
                placeholder="e.g., Employee HDMF"
              />
            </div>
            <div>
              <Label htmlFor="edit-deduction-amount">Amount *</Label>
              <Input
                id="edit-deduction-amount"
                type="number"
                value={deductionFormData.amount}
                onChange={(e) => setDeductionFormData({ ...deductionFormData, amount: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDeductionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateDeduction} className="bg-vibrant-blue hover:bg-vibrant-blue/90">
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Deduction Dialog */}
      <Dialog open={showAddDeductionDialog} onOpenChange={setShowAddDeductionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Deduction</DialogTitle>
            <DialogDescription>
              Add a new deduction for this employee
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="add-deduction-name">Deduction Name *</Label>
              <Input
                id="add-deduction-name"
                value={deductionFormData.name}
                onChange={(e) => setDeductionFormData({ ...deductionFormData, name: e.target.value })}
                placeholder="e.g., Loan Repayment"
              />
            </div>
            <div>
              <Label htmlFor="add-deduction-amount">Amount *</Label>
              <Input
                id="add-deduction-amount"
                type="number"
                value={deductionFormData.amount}
                onChange={(e) => setDeductionFormData({ ...deductionFormData, amount: parseFloat(e.target.value) || 0 })}
                placeholder="0.00"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDeductionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddDeduction} className="bg-vibrant-blue hover:bg-vibrant-blue/90">
              Add Deduction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Deduction</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this deduction? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDeduction}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

