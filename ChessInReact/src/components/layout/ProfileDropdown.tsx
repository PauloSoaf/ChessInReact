"use client";

import { useState, useRef, useEffect } from "react";
import { LogOut, ChevronDown, User, KeyRound, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/I18nContext";
import { AsyncButton } from "@/components/ui/AsyncButton";
import { ChangePasswordModal } from "@/components/auth/ChangePasswordModal";
import { TwoFactorSetupModal } from "@/components/auth/TwoFactorSetupModal";

export function ProfileDropdown() {
  const [open, setOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [twoFactorModalOpen, setTwoFactorModalOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch (error) {
      setLoggingOut(false);
      throw error;
    }
  }

  return (
    <>
      <div className="relative inline-block" ref={dropdownRef}>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 p-1.5 pl-2 pr-2.5 rounded-full hover:bg-warm-surface transition-colors border border-transparent hover:border-border-neutral"
        >
          <div className="w-7 h-7 rounded-full bg-brand-blue flex items-center justify-center text-white text-xs font-bold shrink-0">
            <User className="w-4 h-4" />
          </div>
          <span className="hidden md:block text-sm font-medium text-text-primary ml-1">{t("nav.logout") === "Logout" ? "Profile" : "Perfil"}</span>
          <ChevronDown className="w-3.5 h-3.5 text-text-secondary hidden md:block" />
        </button>

        {/* Dropdown */}
        <div
          className={`absolute right-0 mt-2 w-48 bg-card-bg border border-border-neutral rounded-xl shadow-lg z-50 transform origin-top-right transition-all duration-200 ${
            open ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"
          }`}
        >
          <div className="p-1.5">
            <button
              onClick={() => {
                setOpen(false);
                setPasswordModalOpen(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-secondary hover:text-brand-blue hover:bg-brand-blue/10 rounded-lg transition-colors mb-1"
            >
              <KeyRound className="w-4 h-4" />
              Mudar Senha
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setTwoFactorModalOpen(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-secondary hover:text-brand-blue hover:bg-brand-blue/10 rounded-lg transition-colors mb-1"
            >
              <ShieldCheck className="w-4 h-4" />
              2FA
            </button>
            <AsyncButton
              onClick={handleLogout}
              pending={loggingOut}
              pendingLabel={t("nav.logging_out", { defaultValue: "Saindo..." })}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-text-secondary hover:text-danger hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              {t("nav.logout")}
            </AsyncButton>
          </div>
        </div>
      </div>

      <ChangePasswordModal 
        isOpen={passwordModalOpen} 
        onClose={() => setPasswordModalOpen(false)} 
        isPatient={false} 
      />

      <TwoFactorSetupModal
        isOpen={twoFactorModalOpen}
        onClose={() => setTwoFactorModalOpen(false)}
      />
    </>
  );
}
