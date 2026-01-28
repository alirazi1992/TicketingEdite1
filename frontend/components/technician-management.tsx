"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"
import {
  getAllTechnicians,
  createTechnician,
  updateTechnician,
  updateTechnicianStatus,
  deleteTechnician,
} from "@/lib/technicians-api"
import type { ApiTechnicianResponse } from "@/lib/api-types"
import { Search, Plus, Edit, Trash2, UserCheck, UserX } from "lucide-react"

export function TechnicianManagement() {
  const { token } = useAuth()
  const [technicians, setTechnicians] = useState<ApiTechnicianResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null) // Track which technician is being updated
  const [saving, setSaving] = useState(false) // Track if save operation is in progress
  const [searchQuery, setSearchQuery] = useState("")
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [selectedTechnician, setSelectedTechnician] = useState<ApiTechnicianResponse | null>(null)
  const [technicianToRemove, setTechnicianToRemove] = useState<ApiTechnicianResponse | null>(null)
  const [removingTechnicianId, setRemovingTechnicianId] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    department: "",
    isActive: true,
  })

  useEffect(() => {
    if (token) {
      loadTechnicians()
    }
  }, [token])

  const loadTechnicians = async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await getAllTechnicians(token)
      setTechnicians(data)
    } catch (error: any) {
      console.error("Failed to load technicians:", error)
      toast({
        title: "خطا در بارگذاری تکنسین‌ها",
        description: error?.message || "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!token) return
    try {
      await createTechnician(token, {
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone || null,
        department: formData.department || null,
        isActive: formData.isActive,
      })
      toast({
        title: "تکنسین ایجاد شد",
        description: `${formData.fullName} با موفقیت اضافه شد`,
      })
      setCreateDialogOpen(false)
      resetForm()
      await loadTechnicians()
    } catch (error: any) {
      console.error("Failed to create technician:", error)
      toast({
        title: "خطا در ایجاد تکنسین",
        description: error?.message || "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      })
    }
  }

  const handleUpdate = async () => {
    if (!token || !selectedTechnician) {
      toast({
        title: "خطا",
        description: "لطفاً ابتدا وارد سیستم شوید",
        variant: "destructive",
      })
      return
    }

    // Prevent double-clicks
    if (saving) {
      return
    }
    
    // Validate required fields
    if (!formData.fullName || !formData.email) {
      toast({
        title: "خطا",
        description: "نام کامل و ایمیل الزامی هستند",
        variant: "destructive",
      })
      return
    }

    setSaving(true)
    try {
      console.log("[TechnicianManagement] Updating technician:", {
        id: selectedTechnician.id,
        formData,
      })

      await updateTechnician(token, selectedTechnician.id, {
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone || null,
        department: formData.department || null,
        isActive: formData.isActive, // Include isActive status
      })

      toast({
        title: "تکنسین به‌روزرسانی شد",
        description: `اطلاعات ${formData.fullName} با موفقیت به‌روزرسانی شد`,
      })
      setEditDialogOpen(false)
      setSelectedTechnician(null)
      resetForm()
      await loadTechnicians()
    } catch (error: any) {
      console.error("[TechnicianManagement] Failed to update technician:", error)
      
      const errorMessage = error?.message || error?.body?.message || "لطفاً دوباره تلاش کنید"
      toast({
        title: "خطا در به‌روزرسانی تکنسین",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleStatus = async (technician: ApiTechnicianResponse) => {
    if (!token) {
      toast({
        title: "خطا",
        description: "لطفاً ابتدا وارد سیستم شوید",
        variant: "destructive",
      })
      return
    }

    // Prevent double-clicks
    if (updatingStatus === technician.id) {
      return
    }

    setUpdatingStatus(technician.id)
    const newStatus = !technician.isActive

    try {
      console.log("[TechnicianManagement] Updating status:", {
        technicianId: technician.id,
        currentStatus: technician.isActive,
        newStatus: newStatus,
      })

      await updateTechnicianStatus(token, technician.id, newStatus)

      toast({
        title: newStatus ? "تکنسین فعال شد" : "تکنسین غیرفعال شد",
        description: `${technician.fullName} ${newStatus ? "فعال" : "غیرفعال"} شد`,
      })

      // Reload technicians to get updated status
      await loadTechnicians()
    } catch (error: any) {
      console.error("[TechnicianManagement] Failed to update technician status:", error)
      
      const errorMessage = error?.message || error?.body?.message || "لطفاً دوباره تلاش کنید"
      toast({
        title: "خطا در تغییر وضعیت",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setUpdatingStatus(null)
    }
  }

  const openRemoveDialog = (technician: ApiTechnicianResponse) => {
    setTechnicianToRemove(technician)
    setRemoveDialogOpen(true)
  }

  const handleRemoveTechnician = async () => {
    if (!token || !technicianToRemove) {
      toast({
        title: "خطا",
        description: "لطفاً ابتدا وارد سیستم شوید",
        variant: "destructive",
      })
      return
    }

    if (removingTechnicianId === technicianToRemove.id) {
      return
    }

    setRemovingTechnicianId(technicianToRemove.id)
    try {
      await deleteTechnician(token, technicianToRemove.id)
      toast({
        title: "تکنسین حذف شد",
        description: `${technicianToRemove.fullName} با موفقیت حذف شد`,
      })
      setRemoveDialogOpen(false)
      setTechnicianToRemove(null)
      await loadTechnicians()
    } catch (error: any) {
      console.error("[TechnicianManagement] Failed to remove technician:", error)
      toast({
        title: "خطا در حذف تکنسین",
        description: error?.message || "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      })
    } finally {
      setRemovingTechnicianId(null)
    }
  }

  const resetForm = () => {
    setFormData({
      fullName: "",
      email: "",
      phone: "",
      department: "",
      isActive: true,
    })
  }

  const openEditDialog = (technician: ApiTechnicianResponse) => {
    setSelectedTechnician(technician)
    setFormData({
      fullName: technician.fullName,
      email: technician.email,
      phone: technician.phone || "",
      department: technician.department || "",
      isActive: technician.isActive,
    })
    setEditDialogOpen(true)
  }

  const filteredTechnicians = technicians.filter((tech) => {
    const query = searchQuery.toLowerCase()
    return (
      tech.fullName.toLowerCase().includes(query) ||
      tech.email.toLowerCase().includes(query) ||
      (tech.department && tech.department.toLowerCase().includes(query))
    )
  })

  return (
    <div className="space-y-6" dir="rtl">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-right">مدیریت تکنسین‌ها</CardTitle>
            <Button onClick={() => {
              resetForm()
              setCreateDialogOpen(true)
            }} className="gap-2">
              <Plus className="w-4 h-4" />
              افزودن تکنسین
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="جستجو بر اساس نام، ایمیل یا بخش..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10 text-right"
                dir="rtl"
              />
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="mr-3 text-sm text-muted-foreground">در حال بارگذاری...</span>
            </div>
          ) : filteredTechnicians.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? "نتیجه‌ای یافت نشد" : "هیچ تکنسینی ثبت نشده است"}
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">نام</TableHead>
                    <TableHead className="text-right">ایمیل</TableHead>
                    <TableHead className="text-right">تلفن</TableHead>
                    <TableHead className="text-right">بخش</TableHead>
                    <TableHead className="text-right">وضعیت</TableHead>
                    <TableHead className="text-right">تاریخ ایجاد</TableHead>
                    <TableHead className="text-right">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTechnicians.map((technician) => (
                    <TableRow key={technician.id}>
                      <TableCell className="font-medium">{technician.fullName}</TableCell>
                      <TableCell>{technician.email}</TableCell>
                      <TableCell>{technician.phone || "--"}</TableCell>
                      <TableCell>{technician.department || "--"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={technician.isActive ? "default" : "secondary"}
                          className={technician.isActive ? "" : "bg-gray-500"}
                        >
                          {technician.isActive ? "فعال" : "غیرفعال"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(technician.createdAt).toLocaleDateString("fa-IR")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(technician)}
                            className="gap-1"
                          >
                            <Edit className="w-4 h-4" />
                            ویرایش
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleStatus(technician)}
                            disabled={updatingStatus === technician.id}
                            className="gap-1"
                          >
                            {updatingStatus === technician.id ? (
                              <>
                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                در حال تغییر...
                              </>
                            ) : technician.isActive ? (
                              <>
                                <UserX className="w-4 h-4" />
                                غیرفعال
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-4 h-4" />
                                فعال
                              </>
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openRemoveDialog(technician)}
                            className="gap-1 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                            حذف
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">افزودن تکنسین جدید</DialogTitle>
            <DialogDescription className="text-right">
              اطلاعات تکنسین جدید را وارد کنید
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-right">نام کامل *</Label>
              <Input
                id="fullName"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="text-right"
                dir="rtl"
                placeholder="نام کامل تکنسین"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-right">ایمیل *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="text-right"
                dir="rtl"
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-right">تلفن</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="text-right"
                dir="rtl"
                placeholder="09123456789"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department" className="text-right">بخش</Label>
              <Input
                id="department"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="text-right"
                dir="rtl"
                placeholder="بخش تکنسین"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label htmlFor="isActive" className="text-right">فعال</Label>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => {
                setCreateDialogOpen(false)
                resetForm()
              }}>
                انصراف
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!formData.fullName || !formData.email}
              >
                ایجاد تکنسین
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">ویرایش تکنسین</DialogTitle>
            <DialogDescription className="text-right">
              اطلاعات تکنسین را ویرایش کنید
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-fullName" className="text-right">نام کامل *</Label>
              <Input
                id="edit-fullName"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="text-right"
                dir="rtl"
                placeholder="نام کامل تکنسین"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email" className="text-right">ایمیل *</Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="text-right"
                dir="rtl"
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone" className="text-right">تلفن</Label>
              <Input
                id="edit-phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="text-right"
                dir="rtl"
                placeholder="09123456789"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-department" className="text-right">بخش</Label>
              <Input
                id="edit-department"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="text-right"
                dir="rtl"
                placeholder="بخش تکنسین"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="edit-isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
              <Label htmlFor="edit-isActive" className="text-right">فعال</Label>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => {
                setEditDialogOpen(false)
                setSelectedTechnician(null)
                resetForm()
              }}>
                انصراف
              </Button>
              <Button
                onClick={handleUpdate}
                disabled={saving || !formData.fullName || !formData.email}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin ml-2" />
                    در حال ذخیره...
                  </>
                ) : (
                  "ذخیره تغییرات"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">حذف تکنسین</DialogTitle>
            <DialogDescription className="text-right">
              آیا از حذف این تکنسین مطمئن هستید؟ این عملیات به صورت حذف نرم انجام می‌شود و
              امکان بازگردانی در آینده وجود دارد.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
              تکنسین حذف شده دیگر در لیست تکنسین‌های فعال و پیشنهادهای تعیین تکنسین نمایش داده نمی‌شود.
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRemoveDialogOpen(false)
                  setTechnicianToRemove(null)
                }}
              >
                انصراف
              </Button>
              <Button
                variant="destructive"
                onClick={handleRemoveTechnician}
                disabled={!technicianToRemove || removingTechnicianId === technicianToRemove?.id}
              >
                {removingTechnicianId === technicianToRemove?.id ? "در حال حذف..." : "تایید حذف"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
