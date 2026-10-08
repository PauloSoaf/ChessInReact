import { AppBreadcrumbs } from "@/components/navigation/AppBreadcrumbs";
import { getPatientHref } from "@/services/patient-route.service";
import { routes } from "@/lib/navigation/routes";
import type { BreadcrumbItem } from "@/lib/navigation/navigation-types";

interface PatientBreadcrumbsProps {
  tenantSlug: string;
  patient: { id: string; name: string };
  currentRoute?: string;
  ariaLabel?: string;
}

export function PatientBreadcrumbs({
  tenantSlug,
  patient,
  currentRoute,
  ariaLabel = "Navegação",
}: PatientBreadcrumbsProps) {
  const patientHref = getPatientHref({ tenant: tenantSlug, patient });

  const items: BreadcrumbItem[] = [
    { label: "Painel", href: routes.dashboard(tenantSlug) },
    { label: "Pacientes", href: routes.patients(tenantSlug) },
    ...(currentRoute
      ? [
          { label: patient.name, href: patientHref },
          { label: currentRoute, current: true },
        ]
      : [{ label: patient.name, current: true }]),
  ];

  return <AppBreadcrumbs items={items} ariaLabel={ariaLabel} />;
}
