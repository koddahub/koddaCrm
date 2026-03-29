import { CrmPage } from '@/app/ui/shell/crm-page';

type CommunicationTemplateViewPageProps = {
  params: {
    id: string;
  };
};

export default function CommunicationTemplateViewPage({ params }: CommunicationTemplateViewPageProps) {
  return <CrmPage section="communication" communicationView="templates-view" communicationRecordId={params.id} />;
}
