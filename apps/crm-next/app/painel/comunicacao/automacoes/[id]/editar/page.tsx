import { CrmPage } from '@/app/ui/shell/crm-page';

type CommunicationAutomationEditPageProps = {
  params: {
    id: string;
  };
};

export default function CommunicationAutomationEditPage({ params }: CommunicationAutomationEditPageProps) {
  return <CrmPage section="communication" communicationView="automations-edit" communicationRecordId={params.id} />;
}
