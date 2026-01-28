"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { useForm, Controller } from "react-hook-form"
import { yupResolver } from "@hookform/resolvers/yup"
import * as yup from "yup"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/hooks/use-toast"
import { useAuth } from "@/lib/auth-context"
import { usePreferences } from "@/lib/preferences-context"
import { getSystemSettings, updateSystemSettings } from "@/lib/settings-api"
import { getMyNotificationPreferences, updateMyNotificationPreferences } from "@/lib/notification-preferences-api"
import type { ApiSystemSettingsResponse, ApiNotificationPreferencesResponse } from "@/lib/api-types"
import {
  User,
  Lock,
  Upload,
  Eye,
  EyeOff,
  Camera,
  X,
  Settings,
  Bell,
  Shield,
  Palette,
  Globe,
  Monitor,
  Moon,
  Sun,
  Languages,
} from "lucide-react"

const profileSchema = yup.object({
  name: yup.string().required("نام الزامی است"),
  email: yup.string().email("ایمیل معتبر وارد کنید").required("ایمیل الزامی است"),
  phone: yup.string().optional(),
  department: yup.string().optional(),
})

const passwordSchema = yup.object({
  currentPassword: yup.string().required("رمز عبور فعلی الزامی است"),
  newPassword: yup
    .string()
    .required("رمز عبور جدید الزامی است")
    .min(8, "رمز عبور جدید باید حداقل ۸ کاراکتر باشد")
    .matches(
      /^(?=.*[a-zA-Z])(?=.*\d).+$/,
      "رمز عبور جدید باید شامل حداقل یک حرف و یک عدد باشد"
    ),
  confirmPassword: yup
    .string()
    .required("تکرار رمز عبور الزامی است")
    .oneOf([yup.ref("newPassword")], "رمز عبور جدید و تکرار آن مطابقت ندارند"),
})

const systemSettingsSchema = yup.object({
  appName: yup.string().required("نام سامانه الزامی است"),
  supportEmail: yup.string().email("ایمیل معتبر وارد کنید").required("ایمیل پشتیبانی الزامی است"),
  supportPhone: yup.string().optional(),
  defaultLanguage: yup.string().oneOf(["fa", "en"]).required(),
  defaultTheme: yup.string().oneOf(["light", "dark", "system"]).required(),
  timezone: yup.string().required(),
  defaultPriority: yup.string().required(),
  defaultStatus: yup.string().required(),
  responseSlaHours: yup.number().min(1).max(168).required(),
  autoAssignEnabled: yup.boolean().required(),
  allowClientAttachments: yup.boolean().required(),
  maxAttachmentSizeMB: yup.number().min(1).max(100).required(),
  emailNotificationsEnabled: yup.boolean().required(),
  smsNotificationsEnabled: yup.boolean().required(),
  notifyOnTicketCreated: yup.boolean().required(),
  notifyOnTicketAssigned: yup.boolean().required(),
  notifyOnTicketReplied: yup.boolean().required(),
  notifyOnTicketClosed: yup.boolean().required(),
  passwordMinLength: yup.number().min(4).max(32).required(),
  require2FA: yup.boolean().required(),
  sessionTimeoutMinutes: yup.number().min(5).max(1440).required(),
  allowedEmailDomains: yup.array().of(yup.string()).default([]),
})

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SystemSettings {
  notifications: {
    email: boolean
    push: boolean
    sms: boolean
    desktop: boolean
  }
  appearance: {
    theme: "light" | "dark" | "system"
    language: "fa" | "en"
    fontSize: "small" | "medium" | "large"
  }
  privacy: {
    profileVisibility: boolean
    activityStatus: boolean
    readReceipts: boolean
  }
  system: {
    autoSave: boolean
    soundEffects: boolean
    animations: boolean
    compactMode: boolean
  }
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { user, updateProfile, changePassword, isLoading, token } = useAuth()
  const { preferences, updatePreferences, isLoading: preferencesLoading } = usePreferences()
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  })
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [systemSettingsLoading, setSystemSettingsLoading] = useState(false)
  const [systemSettingsData, setSystemSettingsData] = useState<ApiSystemSettingsResponse | null>(null)
  const [appearanceSaving, setAppearanceSaving] = useState(false)
  const [notificationPreferences, setNotificationPreferences] = useState<ApiNotificationPreferencesResponse | null>(null)
  const [notificationPreferencesLoading, setNotificationPreferencesLoading] = useState(false)
  const [notificationPreferencesSaving, setNotificationPreferencesSaving] = useState(false)
  const isAdmin = user?.role === "admin"

  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    notifications: {
      email: true,
      push: true,
      sms: false,
      desktop: true,
    },
    appearance: {
      theme: "system",
      language: "fa",
      fontSize: "medium",
    },
    privacy: {
      profileVisibility: true,
      activityStatus: true,
      readReceipts: true,
    },
    system: {
      autoSave: true,
      soundEffects: true,
      animations: true,
      compactMode: false,
    },
  })

  const profileForm = useForm({
    resolver: yupResolver(profileSchema),
    defaultValues: {
      name: user?.name || "",
      email: user?.email || "",
      phone: user?.phone || "",
      department: user?.department || "",
    },
  })

  const passwordForm = useForm({
    resolver: yupResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  })

  const systemSettingsForm = useForm<ApiSystemSettingsResponse>({
    resolver: yupResolver(systemSettingsSchema),
    defaultValues: {
      appName: "",
      supportEmail: "",
      supportPhone: "",
      defaultLanguage: "fa",
      defaultTheme: "system",
      timezone: "Asia/Tehran",
      defaultPriority: "Medium",
      defaultStatus: "Submitted",
      responseSlaHours: 24,
      autoAssignEnabled: false,
      allowClientAttachments: true,
      maxAttachmentSizeMB: 10,
      emailNotificationsEnabled: true,
      smsNotificationsEnabled: false,
      notifyOnTicketCreated: true,
      notifyOnTicketAssigned: true,
      notifyOnTicketReplied: true,
      notifyOnTicketClosed: true,
      passwordMinLength: 6,
      require2FA: false,
      sessionTimeoutMinutes: 60,
      allowedEmailDomains: [],
    },
  })

  // Fetch system settings when dialog opens (admin only)
  useEffect(() => {
    if (open && isAdmin && token) {
      setSystemSettingsLoading(true)
      getSystemSettings(token)
        .then((data) => {
          setSystemSettingsData(data)
          systemSettingsForm.reset(data)
        })
        .catch((error: any) => {
          console.error("Failed to load system settings:", error)
          const status = error?.status || 0
          const errorMessage = error?.message || "خطای نامشخص"
          
          if (status === 403 || status === 401 || errorMessage?.includes("403") || errorMessage?.includes("401")) {
            toast({
              title: "دسترسی محدود",
              description: "فقط مدیران می‌توانند تنظیمات سیستم را مشاهده کنند",
              variant: "destructive",
            })
          } else {
            toast({
              title: "خطا در بارگذاری تنظیمات",
              description: errorMessage || "لطفاً دوباره تلاش کنید",
              variant: "destructive",
            })
          }
        })
        .finally(() => {
          setSystemSettingsLoading(false)
        })
    } else if (open && !isAdmin) {
      // Clear form if not admin
      setSystemSettingsData(null)
      systemSettingsForm.reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isAdmin, token])

  // Fetch notification preferences when dialog opens
  useEffect(() => {
    if (open && token) {
      console.log("[Notifications] Fetching notification preferences...")
      setNotificationPreferencesLoading(true)
      getMyNotificationPreferences(token)
        .then((data) => {
          console.log("[Notifications] Received preferences:", data)
          setNotificationPreferences(data)
          // Update local state for UI
          setSystemSettings((prev) => ({
            ...prev,
            notifications: {
              email: data.emailEnabled,
              push: data.pushEnabled,
              sms: data.smsEnabled,
              desktop: data.desktopEnabled,
            },
          }))
        })
        .catch((error: any) => {
          console.error("[Notifications] Failed to load preferences:", error)
          const status = error?.status || 0
          const errorMessage = error?.message || "خطای نامشخص"
          
          // Use defaults on error
          const defaults: ApiNotificationPreferencesResponse = {
            emailEnabled: true,
            pushEnabled: true,
            smsEnabled: false,
            desktopEnabled: true,
          }
          console.log("[Notifications] Using defaults due to error:", defaults)
          setNotificationPreferences(defaults)
          setSystemSettings((prev) => ({
            ...prev,
            notifications: {
              email: defaults.emailEnabled,
              push: defaults.pushEnabled,
              sms: defaults.smsEnabled,
              desktop: defaults.desktopEnabled,
            },
          }))
          
          if (status !== 401 && status !== 403) {
            // Don't show error for auth issues (user might not be logged in)
            toast({
              title: "خطا در بارگذاری تنظیمات اعلان‌ها",
              description: errorMessage || "از مقادیر پیش‌فرض استفاده می‌شود",
              variant: "destructive",
            })
          }
        })
        .finally(() => {
          setNotificationPreferencesLoading(false)
        })
    } else if (!open) {
      // Clear state when dialog closes
      setNotificationPreferences(null)
    }
  }, [open, token])

  const onSystemSettingsSubmit = async (data: ApiSystemSettingsResponse) => {
    console.log("Submitting system settings:", data)
    
    if (!token || !isAdmin) {
      toast({
        title: "دسترسی محدود",
        description: "فقط مدیران می‌توانند تنظیمات سیستم را تغییر دهند",
        variant: "destructive",
      })
      return
    }

    setSystemSettingsLoading(true)
    try {
      console.log("Calling updateSystemSettings API...")
      const updated = await updateSystemSettings(token, data)
      console.log("Settings updated successfully:", updated)
      setSystemSettingsData(updated)
      systemSettingsForm.reset(updated)
      toast({
        title: "تنظیمات سیستم ذخیره شد",
        description: "تغییرات با موفقیت اعمال شد",
      })
    } catch (error: any) {
      console.error("Failed to update system settings:", error)
      const status = error?.status || 0
      const errorBody = error?.body || {}
      let errorMessage = error?.message || "خطای نامشخص"
      
      // Try to extract detailed error message from validation errors
      if (errorBody.errors && typeof errorBody.errors === "object") {
        const errors = errorBody.errors as Record<string, unknown>
        const firstErrorKey = Object.keys(errors)[0]
        const firstError = errors[firstErrorKey]
        if (Array.isArray(firstError) && firstError.length > 0) {
          errorMessage = String(firstError[0])
        }
      }
      
      if (status === 403 || status === 401 || errorMessage?.includes("403") || errorMessage?.includes("401")) {
        toast({
          title: "دسترسی محدود",
          description: "فقط مدیران می‌توانند تنظیمات سیستم را تغییر دهند",
          variant: "destructive",
        })
      } else if (status === 400) {
        // Validation error
        toast({
          title: "خطا در اعتبارسنجی",
          description: errorMessage || "لطفاً مقادیر را بررسی کنید",
          variant: "destructive",
        })
      } else {
        toast({
          title: "خطا در ذخیره تنظیمات",
          description: errorMessage || "لطفاً دوباره تلاش کنید",
          variant: "destructive",
        })
      }
    } finally {
      setSystemSettingsLoading(false)
    }
  }

  const handleSystemSettingsReset = () => {
    if (systemSettingsData) {
      systemSettingsForm.reset(systemSettingsData)
      toast({
        title: "تنظیمات بازنشانی شد",
        description: "همه تغییرات لغو شد",
      })
    }
  }

  const handleNotificationToggle = (setting: "email" | "push" | "sms" | "desktop") => {
    // If preferences haven't loaded yet, initialize with defaults
    const currentPrefs = notificationPreferences || {
      emailEnabled: true,
      pushEnabled: true,
      smsEnabled: false,
      desktopEnabled: true,
    }

    const updated = {
      ...currentPrefs,
      emailEnabled: setting === "email" ? !currentPrefs.emailEnabled : currentPrefs.emailEnabled,
      pushEnabled: setting === "push" ? !currentPrefs.pushEnabled : currentPrefs.pushEnabled,
      smsEnabled: setting === "sms" ? !currentPrefs.smsEnabled : currentPrefs.smsEnabled,
      desktopEnabled: setting === "desktop" ? !currentPrefs.desktopEnabled : currentPrefs.desktopEnabled,
    }

    console.log("[Notifications] Toggle changed:", setting, "New state:", updated)
    setNotificationPreferences(updated)
    setSystemSettings((prev) => ({
      ...prev,
      notifications: {
        email: updated.emailEnabled,
        push: updated.pushEnabled,
        sms: updated.smsEnabled,
        desktop: updated.desktopEnabled,
      },
    }))
  }

  const handleNotificationSave = async () => {
    if (!token) {
      toast({
        title: "خطا",
        description: "لطفاً ابتدا وارد شوید",
        variant: "destructive",
      })
      return
    }

    // Use current preferences or defaults
    const prefsToSave = notificationPreferences || {
      emailEnabled: true,
      pushEnabled: true,
      smsEnabled: false,
      desktopEnabled: true,
    }

    console.log("[Notifications] Saving preferences:", prefsToSave)
    setNotificationPreferencesSaving(true)
    try {
      const updated = await updateMyNotificationPreferences(token, prefsToSave)
      console.log("[Notifications] Save successful, received:", updated)
      setNotificationPreferences(updated)
      setSystemSettings((prev) => ({
        ...prev,
        notifications: {
          email: updated.emailEnabled,
          push: updated.pushEnabled,
          sms: updated.smsEnabled,
          desktop: updated.desktopEnabled,
        },
      }))
      toast({
        title: "تنظیمات اعلان‌ها ذخیره شد",
        description: "تغییرات با موفقیت اعمال شد",
      })
    } catch (error: any) {
      console.error("[Notifications] Failed to save:", error)
      const status = error?.status || 0
      const errorBody = error?.body || {}
      let errorMessage = error?.message || "خطای نامشخص"
      
      // Try to extract detailed error message
      if (errorBody.errors && typeof errorBody.errors === "object") {
        const errors = errorBody.errors as Record<string, unknown>
        const firstErrorKey = Object.keys(errors)[0]
        const firstError = errors[firstErrorKey]
        if (Array.isArray(firstError) && firstError.length > 0) {
          errorMessage = String(firstError[0])
        }
      } else if (errorBody.message && typeof errorBody.message === "string") {
        errorMessage = errorBody.message
      }
      
      toast({
        title: "خطا در ذخیره تنظیمات",
        description: errorMessage || "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      })
      
      // Revert to last saved state by refetching
      try {
        const current = await getMyNotificationPreferences(token)
        setNotificationPreferences(current)
        setSystemSettings((prev) => ({
          ...prev,
          notifications: {
            email: current.emailEnabled,
            push: current.pushEnabled,
            sms: current.smsEnabled,
            desktop: current.desktopEnabled,
          },
        }))
      } catch (reloadError) {
        console.error("[Notifications] Failed to reload after error:", reloadError)
        // Keep current state if reload fails
      }
    } finally {
      setNotificationPreferencesSaving(false)
    }
  }

  const toggleSetting = (category: keyof SystemSettings, setting: string, value?: any) => {
    // This is only used for the old systemSettings that aren't connected to backend
    // Keep it for backward compatibility but notifications should use handleNotificationToggle
    setSystemSettings((prev) => ({
      ...prev,
      [category]: {
        ...prev[category],
        [setting]: value !== undefined ? value : !prev[category][setting as keyof (typeof prev)[typeof category]],
      },
    }))
  }

  const ToggleButton = ({
    active,
    onToggle,
    label,
    description,
  }: {
    active: boolean
    onToggle: () => void
    label: string
    description?: string
  }) => (
    <div className="flex items-center justify-between py-3 px-1" dir="rtl">
      {/* Button on LEFT in RTL */}
      <Button
        type="button"
        variant={active ? "default" : "outline"}
        size="sm"
        onClick={onToggle}
        className="w-16 h-8 flex-shrink-0 ml-4"
      >
        {active ? "فعال" : "غیرفعال"}
      </Button>
      {/* Text content on RIGHT in RTL */}
      <div className="flex-1 text-right">
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-muted-foreground mt-1">{description}</div>}
      </div>
    </div>
  )

  const handleAppearanceChange = async (field: "theme" | "fontSize" | "language", value: string) => {
    if (!preferences) return

    const updated = {
      ...preferences,
      [field]: value,
    }

    setAppearanceSaving(true)
    const success = await updatePreferences(updated)
    setAppearanceSaving(false)

    if (success) {
      toast({
        title: "تنظیمات ظاهری به‌روزرسانی شد",
        description: "تغییرات شما ذخیره شد",
      })
    } else {
      toast({
        title: "خطا در ذخیره تنظیمات",
        description: "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      })
    }
  }

  const ThemeSelector = () => {
    const currentTheme = preferences?.theme || "system"
    return (
      <div className="space-y-3">
        <Label className="text-sm font-medium">تم ظاهری</Label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: "light", label: "روشن", icon: Sun },
            { value: "dark", label: "تیره", icon: Moon },
            { value: "system", label: "سیستم", icon: Monitor },
          ].map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              type="button"
              variant={currentTheme === value ? "default" : "outline"}
              size="sm"
              onClick={() => handleAppearanceChange("theme", value)}
              disabled={appearanceSaving || preferencesLoading}
              className="h-12 flex-col gap-1"
            >
              <Icon className="w-4 h-4" />
              <span className="text-xs">{label}</span>
            </Button>
          ))}
        </div>
      </div>
    )
  }

  const FontSizeSelector = () => {
    const currentFontSize = preferences?.fontSize || "md"
    const fontSizeMap: Record<string, string> = {
      sm: "small",
      md: "medium",
      lg: "large",
    }
    const reverseMap: Record<string, string> = {
      small: "sm",
      medium: "md",
      large: "lg",
    }
    return (
      <div className="space-y-3">
        <Label className="text-sm font-medium">اندازه فونت</Label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: "sm", label: "کوچک" },
            { value: "md", label: "متوسط" },
            { value: "lg", label: "بزرگ" },
          ].map(({ value, label }) => (
            <Button
              key={value}
              type="button"
              variant={currentFontSize === value ? "default" : "outline"}
              size="sm"
              onClick={() => handleAppearanceChange("fontSize", value)}
              disabled={appearanceSaving || preferencesLoading}
              className="h-10"
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
    )
  }

  const onProfileSubmit = async (data: any) => {
    try {
      const success = await updateProfile(data)
      if (success) {
        toast({
          title: "پروفایل به‌روزرسانی شد",
          description: "اطلاعات شما با موفقیت ذخیره شد",
        })
      } else {
        throw new Error("Update failed")
      }
    } catch (error) {
      toast({
        title: "خطا در به‌روزرسانی",
        description: "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      })
    }
  }

  const onPasswordSubmit = async (data: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
    try {
      const success = await changePassword(data.currentPassword, data.newPassword, data.confirmPassword)
      if (success) {
        toast({
          title: "رمز عبور تغییر کرد",
          description: "رمز عبور شما با موفقیت تغییر یافت",
        })
        passwordForm.reset()
      } else {
        toast({
          title: "خطا در تغییر رمز عبور",
          description: "رمز عبور فعلی اشتباه است یا رمز عبور جدید معتبر نیست",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error("Password change error:", error)
      const status = error?.status || 0
      const errorBody = error?.body || {}
      let errorMessage = error?.message || "خطای نامشخص"
      
      // Try to extract detailed error message from validation errors
      if (errorBody.errors && typeof errorBody.errors === "object") {
        const errors = errorBody.errors as Record<string, unknown>
        const firstErrorKey = Object.keys(errors)[0]
        const firstError = errors[firstErrorKey]
        if (Array.isArray(firstError) && firstError.length > 0) {
          errorMessage = String(firstError[0])
        }
      } else if (errorBody.message && typeof errorBody.message === "string") {
        errorMessage = errorBody.message
      }
      
      toast({
        title: "خطا در تغییر رمز عبور",
        description: errorMessage || "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      })
    }
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"]
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "فرمت فایل نامعتبر",
        description: "لطفاً فایل JPG، PNG یا GIF انتخاب کنید",
        variant: "destructive",
      })
      return
    }

    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      toast({
        title: "حجم فایل زیاد است",
        description: "حداکثر حجم مجاز ۵ مگابایت است",
        variant: "destructive",
      })
      return
    }

    setIsUploadingAvatar(true)

    try {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const result = e.target?.result as string
        setAvatarPreview(result)

        await new Promise((resolve) => setTimeout(resolve, 1000))

        const success = await updateProfile({ avatar: result })
        if (success) {
          toast({
            title: "تصویر پروفایل به‌روزرسانی شد",
            description: "تصویر جدید شما با موفقیت ذخیره شد",
          })
        } else {
          throw new Error("Upload failed")
        }
      }
      reader.readAsDataURL(file)
    } catch (error) {
      toast({
        title: "خطا در آپلود تصویر",
        description: "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      })
      setAvatarPreview(null)
    } finally {
      setIsUploadingAvatar(false)
    }

    event.target.value = ""
  }

  const handleRemoveAvatar = async () => {
    try {
      setIsUploadingAvatar(true)
      const success = await updateProfile({ avatar: null })
      if (success) {
        setAvatarPreview(null)
        toast({
          title: "تصویر پروفایل حذف شد",
          description: "تصویر پروفایل شما با موفقیت حذف شد",
        })
      }
    } catch (error) {
      toast({
        title: "خطا در حذف تصویر",
        description: "لطفاً دوباره تلاش کنید",
        variant: "destructive",
      })
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const triggerFileInput = () => {
    document.getElementById("avatar-upload")?.click()
  }

  if (!user) return null

  const currentAvatar = avatarPreview || user.avatar

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="text-right flex items-center gap-2 justify-end">
            <Settings className="w-5 h-5" />
            تنظیمات سیستم
          </DialogTitle>
          <DialogDescription className="text-right">مدیریت تنظیمات حساب کاربری، ظاهر و عملکرد سیستم</DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto max-h-[calc(90vh-120px)]" dir="rtl">
          <Tabs defaultValue="general" className="w-full" dir="rtl">
            {/* Tabs navigation - RTL order: rightmost item is first in RTL */}
            <TabsList className="grid w-full grid-cols-4 mb-6" dir="rtl">
              <TabsTrigger value="general" className="gap-2 text-xs flex-row-reverse" dir="rtl">
                <User className="w-4 h-4" />
                تنظیمات عمومی
              </TabsTrigger>
              <TabsTrigger value="ticketing-defaults" className="gap-2 text-xs flex-row-reverse" dir="rtl">
                <Monitor className="w-4 h-4" />
                تنظیمات پیش‌فرض تیکتینگ
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-2 text-xs flex-row-reverse" dir="rtl">
                <Bell className="w-4 h-4" />
                تنظیمات اعلان‌ها
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-2 text-xs flex-row-reverse" dir="rtl">
                <Lock className="w-4 h-4" />
                تنظیمات امنیتی
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 w-full">
              <Card dir="rtl" className="w-full">
                <CardHeader className="text-right">
                  <CardTitle className="text-right">اطلاعات شخصی</CardTitle>
                  <CardDescription className="text-right">اطلاعات پروفایل و تصویر خود را مدیریت کنید</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6" dir="rtl">
                  <div className="flex items-center gap-4 justify-end">
                    <div className="space-y-2 text-right">
                      <Label htmlFor="avatar-upload" className="text-right">
                        تصویر پروفایل
                      </Label>
                      <div className="flex gap-2 justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={triggerFileInput}
                          disabled={isUploadingAvatar}
                        >
                          {isUploadingAvatar ? (
                            <>
                              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin ml-2" />
                              در حال آپلود...
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4 ml-2" />
                              تغییر تصویر
                            </>
                          )}
                        </Button>
                        {currentAvatar && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleRemoveAvatar}
                            disabled={isUploadingAvatar}
                            className="text-red-600 hover:text-red-700 bg-transparent"
                          >
                            <X className="w-4 h-4 ml-2" />
                            حذف تصویر
                          </Button>
                        )}
                        <input
                          id="avatar-upload"
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/gif"
                          className="hidden"
                          onChange={handleAvatarUpload}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground text-right">
                        فرمت‌های مجاز: JPG، PNG، GIF (حداکثر ۵ مگابایت)
                      </p>
                    </div>
                    <div className="relative">
                      <Avatar className="h-20 w-20">
                        <AvatarImage src={currentAvatar || "/placeholder.svg"} alt={user.name} />
                        <AvatarFallback className="text-lg">{user.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      {isUploadingAvatar && (
                        <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full p-0"
                        onClick={triggerFileInput}
                        disabled={isUploadingAvatar}
                      >
                        <Camera className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4" dir="rtl">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2 text-right">
                        <Label htmlFor="name" className="text-right">
                          نام و نام خانوادگی
                        </Label>
                        <Controller
                          name="name"
                          control={profileForm.control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              placeholder="نام کامل"
                              disabled={isLoading}
                              className="text-right"
                              dir="rtl"
                            />
                          )}
                        />
                        {profileForm.formState.errors.name && (
                          <p className="text-sm text-red-500 text-right">{profileForm.formState.errors.name.message}</p>
                        )}
                      </div>

                      <div className="space-y-2 text-right">
                        <Label htmlFor="email" className="text-right">
                          ایمیل
                        </Label>
                        <Controller
                          name="email"
                          control={profileForm.control}
                          render={({ field }) => (
                            <Input {...field} type="email" disabled={isLoading} className="text-right" dir="rtl" />
                          )}
                        />
                        {profileForm.formState.errors.email && (
                          <p className="text-sm text-red-500 text-right">
                            {profileForm.formState.errors.email.message}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2 text-right">
                        <Label htmlFor="phone" className="text-right">
                          شماره تماس
                        </Label>
                        <Controller
                          name="phone"
                          control={profileForm.control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              placeholder="09123456789"
                              disabled={isLoading}
                              className="text-right"
                              dir="rtl"
                            />
                          )}
                        />
                      </div>

                      <div className="space-y-2 text-right">
                        <Label htmlFor="department" className="text-right">
                          بخش
                        </Label>
                        <Controller
                          name="department"
                          control={profileForm.control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              placeholder="نام بخش"
                              disabled={isLoading}
                              className="text-right"
                              dir="rtl"
                            />
                          )}
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button type="submit" disabled={isLoading}>
                        {isLoading ? "در حال ذخیره..." : "ذخیره تغییرات"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              {preferencesLoading && !preferences ? (
                <Card dir="rtl">
                  <CardContent className="py-8 text-center">
                    <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground">در حال بارگذاری تنظیمات...</p>
                  </CardContent>
                </Card>
              ) : (
                <Card dir="rtl" className="w-full">
                  <CardHeader className="w-full text-right space-y-2">
                    <CardTitle className="text-right flex items-center gap-2 justify-end">
                      <Palette className="w-5 h-5" />
                      تنظیمات ظاهری
                    </CardTitle>
                    <CardDescription className="text-right">
                      ظاهر و نمایش سیستم را شخصی‌سازی کنید
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6" dir="rtl">
                    <ThemeSelector />
                    <Separator />
                    <FontSizeSelector />
                    <Separator />
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">زبان سیستم</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant={preferences?.language === "fa" ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleAppearanceChange("language", "fa")}
                          disabled={appearanceSaving || preferencesLoading}
                          className="h-10 gap-2"
                        >
                          <Languages className="w-4 h-4" />
                          فارسی
                        </Button>
                        <Button
                          type="button"
                          variant={preferences?.language === "en" ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleAppearanceChange("language", "en")}
                          disabled={appearanceSaving || preferencesLoading}
                          className="h-10 gap-2"
                        >
                          <Globe className="w-4 h-4" />
                          English
                        </Button>
                      </div>
                    </div>
                    {appearanceSaving && (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        در حال ذخیره...
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="security" className="space-y-4 w-full">
              <Card dir="rtl" className="w-full">
                <CardHeader className="text-right">
                  <CardTitle className="text-right">تغییر رمز عبور</CardTitle>
                  <CardDescription className="text-right">برای امنیت حساب خود رمز عبور قوی انتخاب کنید</CardDescription>
                </CardHeader>
                <CardContent dir="rtl">
                  <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4" dir="rtl">
                    <div className="space-y-2 text-right">
                      <Label htmlFor="currentPassword" className="text-right">
                        رمز عبور فعلی
                      </Label>
                      <div className="relative">
                        <Controller
                          name="currentPassword"
                          control={passwordForm.control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              type={showPasswords.current ? "text" : "password"}
                              disabled={isLoading}
                              className="text-right pr-10"
                              dir="rtl"
                            />
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPasswords((prev) => ({ ...prev, current: !prev.current }))}
                        >
                          {showPasswords.current ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      {passwordForm.formState.errors.currentPassword && (
                        <p className="text-sm text-red-500 text-right">
                          {passwordForm.formState.errors.currentPassword.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 text-right">
                      <Label htmlFor="newPassword" className="text-right">
                        رمز عبور جدید
                      </Label>
                      <div className="relative">
                        <Controller
                          name="newPassword"
                          control={passwordForm.control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              type={showPasswords.new ? "text" : "password"}
                              disabled={isLoading}
                              className="text-right pr-10"
                              dir="rtl"
                            />
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPasswords((prev) => ({ ...prev, new: !prev.new }))}
                        >
                          {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      {passwordForm.formState.errors.newPassword && (
                        <p className="text-sm text-red-500 text-right">
                          {passwordForm.formState.errors.newPassword.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 text-right">
                      <Label htmlFor="confirmPassword" className="text-right">
                        تکرار رمز عبور جدید
                      </Label>
                      <div className="relative">
                        <Controller
                          name="confirmPassword"
                          control={passwordForm.control}
                          render={({ field }) => (
                            <Input
                              {...field}
                              type={showPasswords.confirm ? "text" : "password"}
                              disabled={isLoading}
                              className="text-right pr-10"
                              dir="rtl"
                            />
                          )}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                          onClick={() => setShowPasswords((prev) => ({ ...prev, confirm: !prev.confirm }))}
                        >
                          {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      {passwordForm.formState.errors.confirmPassword && (
                        <p className="text-sm text-red-500 text-right">
                          {passwordForm.formState.errors.confirmPassword.message}
                        </p>
                      )}
                    </div>

                    <div className="flex justify-end">
                      <Button type="submit" disabled={isLoading}>
                        {isLoading ? "در حال تغییر..." : "تغییر رمز عبور"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-4 w-full">
              {notificationPreferencesLoading && !notificationPreferences ? (
                <Card dir="rtl" className="w-full">
                  <CardContent className="py-8 text-center">
                    <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground">در حال بارگذاری تنظیمات...</p>
                  </CardContent>
                </Card>
              ) : (
                <Card dir="rtl" className="w-full">
                  <CardHeader className="w-full text-right">
                    <CardTitle className="text-right flex items-center gap-2 justify-end">
                      <Bell className="w-5 h-5" />
                      تنظیمات اعلان‌ها
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 w-full" dir="rtl">
                    <ToggleButton
                      active={notificationPreferences?.emailEnabled ?? systemSettings.notifications.email}
                      onToggle={() => handleNotificationToggle("email")}
                      label="اعلان‌های ایمیل"
                      description="دریافت اعلان‌ها از طریق ایمیل"
                    />
                    <Separator />
                    <ToggleButton
                      active={notificationPreferences?.pushEnabled ?? systemSettings.notifications.push}
                      onToggle={() => handleNotificationToggle("push")}
                      label="اعلان‌های فوری"
                      description="نمایش اعلان‌ها در مرورگر"
                    />
                    <Separator />
                    <ToggleButton
                      active={notificationPreferences?.smsEnabled ?? systemSettings.notifications.sms}
                      onToggle={() => handleNotificationToggle("sms")}
                      label="اعلان‌های پیامکی"
                      description="دریافت پیامک برای اعلان‌های مهم"
                    />
                    <Separator />
                    <ToggleButton
                      active={notificationPreferences?.desktopEnabled ?? systemSettings.notifications.desktop}
                      onToggle={() => handleNotificationToggle("desktop")}
                      label="اعلان‌های دسکتاپ"
                      description="نمایش اعلان‌ها روی دسکتاپ"
                    />
                    <Separator />
                    <div className="flex justify-end pt-4">
                      <Button
                        type="button"
                        onClick={handleNotificationSave}
                        disabled={notificationPreferencesSaving || notificationPreferencesLoading || !token}
                      >
                        {notificationPreferencesSaving ? (
                          <>
                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin ml-2" />
                            در حال ذخیره...
                          </>
                        ) : (
                          "ذخیره تنظیمات"
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="ticketing-defaults" className="space-y-4 w-full">
              {!isAdmin ? (
                <Card dir="rtl" className="w-full">
                  <CardContent className="py-8 text-center">
                    <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">فقط مدیران می‌توانند تنظیمات سیستم را مشاهده و تغییر دهند</p>
                  </CardContent>
                </Card>
              ) : systemSettingsLoading && !systemSettingsData ? (
                <Card dir="rtl" className="w-full">
                  <CardContent className="py-8 text-center">
                    <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground">در حال بارگذاری تنظیمات...</p>
                  </CardContent>
                </Card>
              ) : (
                <form onSubmit={systemSettingsForm.handleSubmit(onSystemSettingsSubmit)} className="space-y-4 flex flex-col" dir="rtl">
                  {/* App / General Settings */}
                  <Card dir="rtl" className="w-full">
                    <CardHeader className="text-right">
                      <CardTitle className="text-right flex items-center gap-2 justify-end">
                        <Globe className="w-5 h-5" />
                        تنظیمات عمومی
                      </CardTitle>
                      <CardDescription className="text-right">تنظیمات کلی سیستم</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4" dir="rtl">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 text-right">
                          <Label htmlFor="appName">نام سامانه</Label>
                          <Controller
                            name="appName"
                            control={systemSettingsForm.control}
                            render={({ field }) => (
                              <Input {...field} placeholder="نام سامانه" disabled={systemSettingsLoading} className="text-right" dir="rtl" />
                            )}
                          />
                          {systemSettingsForm.formState.errors.appName && (
                            <p className="text-sm text-red-500">{systemSettingsForm.formState.errors.appName.message}</p>
                          )}
                        </div>
                        <div className="space-y-2 text-right">
                          <Label htmlFor="supportEmail">ایمیل پشتیبانی</Label>
                          <Controller
                            name="supportEmail"
                            control={systemSettingsForm.control}
                            render={({ field }) => (
                              <Input {...field} type="email" placeholder="support@example.com" disabled={systemSettingsLoading} className="text-right" dir="rtl" />
                            )}
                          />
                          {systemSettingsForm.formState.errors.supportEmail && (
                            <p className="text-sm text-red-500">{systemSettingsForm.formState.errors.supportEmail.message}</p>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 text-right">
                          <Label htmlFor="supportPhone">شماره پشتیبانی</Label>
                          <Controller
                            name="supportPhone"
                            control={systemSettingsForm.control}
                            render={({ field }) => (
                              <Input {...field} placeholder="09123456789" disabled={systemSettingsLoading} className="text-right" dir="rtl" />
                            )}
                          />
                        </div>
                        <div className="space-y-2 text-right">
                          <Label htmlFor="timezone">منطقه زمانی</Label>
                          <Controller
                            name="timezone"
                            control={systemSettingsForm.control}
                            render={({ field }) => (
                              <Input {...field} placeholder="Asia/Tehran" disabled={systemSettingsLoading} className="text-right" dir="rtl" />
                            )}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 text-right">
                          <Label>زبان پیش‌فرض</Label>
                          <Controller
                            name="defaultLanguage"
                            control={systemSettingsForm.control}
                            render={({ field }) => (
                              <Select value={field.value} onValueChange={field.onChange} disabled={systemSettingsLoading}>
                                <SelectTrigger className="text-right" dir="rtl">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="fa">فارسی</SelectItem>
                                  <SelectItem value="en">English</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                        <div className="space-y-2 text-right">
                          <Label>تم پیش‌فرض</Label>
                          <Controller
                            name="defaultTheme"
                            control={systemSettingsForm.control}
                            render={({ field }) => (
                              <Select value={field.value} onValueChange={field.onChange} disabled={systemSettingsLoading}>
                                <SelectTrigger className="text-right" dir="rtl">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="light">روشن</SelectItem>
                                  <SelectItem value="dark">تیره</SelectItem>
                                  <SelectItem value="system">سیستم</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Ticketing Defaults */}
                  <Card dir="rtl" className="w-full">
                    <CardHeader className="text-right">
                      <CardTitle className="text-right flex items-center gap-2 justify-end">
                        <Settings className="w-5 h-5" />
                        تنظیمات پیش‌فرض تیکتینگ
                      </CardTitle>
                      <CardDescription className="text-right">تنظیمات پیش‌فرض برای تیکت‌های جدید</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4" dir="rtl">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 text-right">
                          <Label>اولویت پیش‌فرض</Label>
                          <Controller
                            name="defaultPriority"
                            control={systemSettingsForm.control}
                            render={({ field }) => (
                              <Select value={field.value} onValueChange={field.onChange} disabled={systemSettingsLoading}>
                                <SelectTrigger className="text-right" dir="rtl">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Low">پایین</SelectItem>
                                  <SelectItem value="Medium">متوسط</SelectItem>
                                  <SelectItem value="High">بالا</SelectItem>
                                  <SelectItem value="Critical">بحرانی</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                        <div className="space-y-2 text-right">
                          <Label>وضعیت پیش‌فرض</Label>
                          <Controller
                            name="defaultStatus"
                            control={systemSettingsForm.control}
                            render={({ field }) => (
                              <Select value={field.value} onValueChange={field.onChange} disabled={systemSettingsLoading}>
                                <SelectTrigger className="text-right" dir="rtl">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Submitted">ثبت شد</SelectItem>
                                  <SelectItem value="SeenRead">دیده شد</SelectItem>
                                  <SelectItem value="Open">باز</SelectItem>
                                  <SelectItem value="InProgress">در حال انجام</SelectItem>
                                  <SelectItem value="AnsweredSolved">پاسخ داده شد</SelectItem>
                                  <SelectItem value="Redo">نیاز به بازبینی</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 text-right">
                          <Label htmlFor="responseSlaHours">زمان SLA پاسخ (ساعت)</Label>
                          <Controller
                            name="responseSlaHours"
                            control={systemSettingsForm.control}
                            render={({ field }) => (
                              <Input
                                {...field}
                                type="number"
                                min="1"
                                max="168"
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                disabled={systemSettingsLoading}
                                className="text-right"
                                dir="rtl"
                              />
                            )}
                          />
                          {systemSettingsForm.formState.errors.responseSlaHours && (
                            <p className="text-sm text-red-500">{systemSettingsForm.formState.errors.responseSlaHours.message}</p>
                          )}
                        </div>
                        <div className="space-y-2 text-right">
                          <Label htmlFor="maxAttachmentSizeMB">حداکثر حجم فایل (مگابایت)</Label>
                          <Controller
                            name="maxAttachmentSizeMB"
                            control={systemSettingsForm.control}
                            render={({ field }) => (
                              <Input
                                {...field}
                                type="number"
                                min="1"
                                max="100"
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                disabled={systemSettingsLoading}
                                className="text-right"
                                dir="rtl"
                              />
                            )}
                          />
                          {systemSettingsForm.formState.errors.maxAttachmentSizeMB && (
                            <p className="text-sm text-red-500">{systemSettingsForm.formState.errors.maxAttachmentSizeMB.message}</p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-right">
                            <Label htmlFor="autoAssignEnabled">تعیین خودکار تکنسین</Label>
                            <p className="text-xs text-muted-foreground">تیکت‌های جدید به صورت خودکار به تکنسین‌ها واگذار می‌شوند</p>
                          </div>
                          <Controller
                            name="autoAssignEnabled"
                            control={systemSettingsForm.control}
                            render={({ field }) => (
                              <Switch checked={field.value} onCheckedChange={field.onChange} disabled={systemSettingsLoading} />
                            )}
                          />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <div className="text-right">
                            <Label htmlFor="allowClientAttachments">اجازه آپلود فایل برای مشتری</Label>
                            <p className="text-xs text-muted-foreground">مشتریان می‌توانند فایل به تیکت‌ها ضمیمه کنند</p>
                          </div>
                          <Controller
                            name="allowClientAttachments"
                            control={systemSettingsForm.control}
                            render={({ field }) => (
                              <Switch checked={field.value} onCheckedChange={field.onChange} disabled={systemSettingsLoading} />
                            )}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Notifications */}
                  <Card dir="rtl" className="w-full">
                    <CardHeader className="text-right">
                      <CardTitle className="text-right flex items-center gap-2 justify-end">
                        <Bell className="w-5 h-5" />
                        تنظیمات اعلان‌ها
                      </CardTitle>
                      <CardDescription className="text-right">کنترل اعلان‌های سیستم</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3" dir="rtl">
                      <div className="flex items-center justify-between">
                        <div className="text-right">
                          <Label htmlFor="emailNotificationsEnabled">اعلان‌های ایمیل</Label>
                          <p className="text-xs text-muted-foreground">ارسال اعلان‌ها از طریق ایمیل</p>
                        </div>
                        <Controller
                          name="emailNotificationsEnabled"
                          control={systemSettingsForm.control}
                          render={({ field }) => (
                            <Switch checked={field.value} onCheckedChange={field.onChange} disabled={systemSettingsLoading} />
                          )}
                        />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div className="text-right">
                          <Label htmlFor="smsNotificationsEnabled">اعلان‌های پیامکی</Label>
                          <p className="text-xs text-muted-foreground">ارسال اعلان‌ها از طریق پیامک</p>
                        </div>
                        <Controller
                          name="smsNotificationsEnabled"
                          control={systemSettingsForm.control}
                          render={({ field }) => (
                            <Switch checked={field.value} onCheckedChange={field.onChange} disabled={systemSettingsLoading} />
                          )}
                        />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div className="text-right">
                          <Label htmlFor="notifyOnTicketCreated">اعلان هنگام ایجاد تیکت</Label>
                        </div>
                        <Controller
                          name="notifyOnTicketCreated"
                          control={systemSettingsForm.control}
                          render={({ field }) => (
                            <Switch checked={field.value} onCheckedChange={field.onChange} disabled={systemSettingsLoading} />
                          )}
                        />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div className="text-right">
                          <Label htmlFor="notifyOnTicketAssigned">اعلان هنگام واگذاری تیکت</Label>
                        </div>
                        <Controller
                          name="notifyOnTicketAssigned"
                          control={systemSettingsForm.control}
                          render={({ field }) => (
                            <Switch checked={field.value} onCheckedChange={field.onChange} disabled={systemSettingsLoading} />
                          )}
                        />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div className="text-right">
                          <Label htmlFor="notifyOnTicketReplied">اعلان هنگام پاسخ به تیکت</Label>
                        </div>
                        <Controller
                          name="notifyOnTicketReplied"
                          control={systemSettingsForm.control}
                          render={({ field }) => (
                            <Switch checked={field.value} onCheckedChange={field.onChange} disabled={systemSettingsLoading} />
                          )}
                        />
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <div className="text-right">
                          <Label htmlFor="notifyOnTicketClosed">اعلان هنگام بسته شدن تیکت</Label>
                        </div>
                        <Controller
                          name="notifyOnTicketClosed"
                          control={systemSettingsForm.control}
                          render={({ field }) => (
                            <Switch checked={field.value} onCheckedChange={field.onChange} disabled={systemSettingsLoading} />
                          )}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Security */}
                  <Card dir="rtl" className="w-full">
                    <CardHeader className="text-right">
                      <CardTitle className="text-right flex items-center gap-2 justify-end">
                        <Shield className="w-5 h-5" />
                        تنظیمات امنیتی
                      </CardTitle>
                      <CardDescription className="text-right">تنظیمات امنیت و احراز هویت</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4" dir="rtl">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2 text-right">
                          <Label htmlFor="passwordMinLength">حداقل طول رمز عبور</Label>
                          <Controller
                            name="passwordMinLength"
                            control={systemSettingsForm.control}
                            render={({ field }) => (
                              <Input
                                {...field}
                                type="number"
                                min="4"
                                max="32"
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                disabled={systemSettingsLoading}
                                className="text-right"
                                dir="rtl"
                              />
                            )}
                          />
                          {systemSettingsForm.formState.errors.passwordMinLength && (
                            <p className="text-sm text-red-500">{systemSettingsForm.formState.errors.passwordMinLength.message}</p>
                          )}
                        </div>
                        <div className="space-y-2 text-right">
                          <Label htmlFor="sessionTimeoutMinutes">زمان انقضای نشست (دقیقه)</Label>
                          <Controller
                            name="sessionTimeoutMinutes"
                            control={systemSettingsForm.control}
                            render={({ field }) => (
                              <Input
                                {...field}
                                type="number"
                                min="5"
                                max="1440"
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                disabled={systemSettingsLoading}
                                className="text-right"
                                dir="rtl"
                              />
                            )}
                          />
                          {systemSettingsForm.formState.errors.sessionTimeoutMinutes && (
                            <p className="text-sm text-red-500">{systemSettingsForm.formState.errors.sessionTimeoutMinutes.message}</p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-right">
                            <Label htmlFor="require2FA">نیاز به احراز هویت دو مرحله‌ای</Label>
                            <p className="text-xs text-muted-foreground">اجبار استفاده از 2FA برای همه کاربران</p>
                          </div>
                          <Controller
                            name="require2FA"
                            control={systemSettingsForm.control}
                            render={({ field }) => (
                              <Switch checked={field.value} onCheckedChange={field.onChange} disabled={systemSettingsLoading} />
                            )}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Form Actions */}
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSystemSettingsReset}
                      disabled={systemSettingsLoading || !systemSettingsData}
                    >
                      بازنشانی
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={systemSettingsLoading}
                    >
                      {systemSettingsLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin ml-2" />
                          در حال ذخیره...
                        </>
                      ) : (
                        "ذخیره تنظیمات"
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
