import { defer } from '@tanstack/react-router';
import { getSponsorsForSponsorPack } from '~/server/sponsors';
import discordImage from '~/images/discord-logo-white.svg';
import { sample } from '~/utils/utils';
import { textColors } from "random-number.tsx";
import { gradients } from "random-number.tsx";
import { Route } from "random-number.tsx";
const SplitLoader = () => {
  return {
    randomNumber: Math.random(),
    sponsorsPromise: defer(getSponsorsForSponsorPack())
  };
};
export { SplitLoader as loader };
const SplitComponent = function Index() {
  const {
    randomNumber
  } = Route.useLoaderData();
  const gradient = sample(gradients, randomNumber);
  const textColor = sample(textColors, randomNumber);
  return <>
      {discordImage}
      {gradient}
      {textColor}
    </>;
};
export { SplitComponent as component };