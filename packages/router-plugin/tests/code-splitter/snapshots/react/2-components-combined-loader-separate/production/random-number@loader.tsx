import { defer } from '@tanstack/react-router';
import { getSponsorsForSponsorPack } from '~/server/sponsors';
const SplitLoader = () => {
  return {
    randomNumber: Math.random(),
    sponsorsPromise: defer(getSponsorsForSponsorPack())
  };
};
export { SplitLoader as loader };