import { CrmPage } from '@/app/ui/shell/crm-page';

type CommunicationTemplateEditPageProps = {
  params: {
    id: string;
  };
};

export default function CommunicationTemplateEditPage({ params }: CommunicationTemplateEditPageProps) {
  return <CrmPage section="communication" communicationView="templates-edit" communicationRecordId={params.id} />;
}
