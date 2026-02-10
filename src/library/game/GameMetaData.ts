export type GameMetaData = {
  name: string;
  description: string;
  licenseInformation?: string;
  implementationNotes?: string;
  publisher?: string;
  designer?: string;
  artist?: string;

  tutorialVideoUrl?: string;
  rulesPdfUrl?: string;
  purchaseUrl?: string;
  publisherUrl?: string;
  repositoryUrl?: string;
  bugReportUrl?: string;

  boxArt: string;
  screenshot: string;
};
