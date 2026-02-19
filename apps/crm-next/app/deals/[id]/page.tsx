import { CrmPage } from '@/app/ui/shell/crm-page';

export default function DealDetailsPage({ params }: { params: { id: string } }) {
  return <CrmPage section="deal" dealId={params.id} />;
}
