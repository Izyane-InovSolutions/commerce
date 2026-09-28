import { ProcurementNav } from '@/components/procurement-nav';

export default function ProcurementLayout({
  children,
}: LayoutProps<'/procurement'>) {
  return (
    <div className="space-y-6">
      <ProcurementNav />
      {children}
    </div>
  );
}
