import { CrmPage } from '@/app/ui/shell/crm-page';

type CommunicationEmailViewPageProps = {
  params: {
    id: string;
  };
};

export default function CommunicationEmailViewPage({ params }: CommunicationEmailViewPageProps) {
  return <CrmPage section="communication" communicationView="emails-view" communicationRecordId={params.id} />;
}
