import { CrmPage } from '@/app/ui/shell/crm-page';

type CommunicationSocialEditPageProps = {
  params: {
    id: string;
  };
};

export default function CommunicationSocialEditPage({ params }: CommunicationSocialEditPageProps) {
  return <CrmPage section="communication" communicationView="social-edit" communicationRecordId={params.id} />;
}
