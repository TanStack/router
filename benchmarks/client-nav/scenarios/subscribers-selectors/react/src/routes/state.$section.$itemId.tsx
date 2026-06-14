import { createRoute, useMatches, useParams } from '@tanstack/react-router'
import {
  stringToSubscriberSeed,
  subscriberGroupSize,
  subscriberIndices,
} from '../../../shared'
import { SubscriberValue } from '../subscriberValue'
import { sectionRoute } from './state.$section'

function ParamSectionSubscriber(props: { index: number }) {
  const value = useParams({
    strict: false,
    select: (params) => stringToSubscriberSeed(String(params.section ?? '')),
  })

  return (
    <SubscriberValue kind="paramSection" index={props.index} value={value} />
  )
}

function ParamItemSubscriber(props: { index: number }) {
  const value = useParams({
    strict: false,
    select: (params) => stringToSubscriberSeed(String(params.itemId ?? '')),
  })

  return <SubscriberValue kind="paramItem" index={props.index} value={value} />
}

function ParamObjectSubscriber(props: { index: number }) {
  const value = useParams({
    strict: false,
    select: (params) => ({
      section: String(params.section ?? ''),
      itemId: String(params.itemId ?? ''),
    }),
    structuralSharing: true,
  })

  return (
    <SubscriberValue kind="paramObject" index={props.index} value={value} />
  )
}

function ParamSubscribers() {
  return (
    <>
      {subscriberIndices.params.map((index) => {
        if (index < subscriberGroupSize * 2) {
          return <ParamSectionSubscriber key={index} index={index} />
        }

        if (index < subscriberGroupSize * 3) {
          return <ParamItemSubscriber key={index} index={index} />
        }

        return <ParamObjectSubscriber key={index} index={index} />
      })}
    </>
  )
}

function MatchesDepthSubscriber(props: { index: number }) {
  const value = useMatches({
    select: (matches) => matches.length,
  })

  return (
    <SubscriberValue kind="matchesDepth" index={props.index} value={value} />
  )
}

function MatchObjectSubscriber(props: { index: number }) {
  const value = itemRoute.useMatch({
    select: (match) => ({
      id: match.id,
      section: String(match.params.section ?? ''),
      itemId: String(match.params.itemId ?? ''),
    }),
    structuralSharing: true,
  })

  return (
    <SubscriberValue kind="matchObject" index={props.index} value={value} />
  )
}

function MatchSubscribers() {
  return (
    <>
      {subscriberIndices.matches.map((index) => {
        if (index < subscriberGroupSize) {
          return <MatchesDepthSubscriber key={index} index={index} />
        }

        return <MatchObjectSubscriber key={index} index={index} />
      })}
    </>
  )
}

function ItemPage() {
  return (
    <>
      <ParamSubscribers />
      <MatchSubscribers />
    </>
  )
}

export const itemRoute = createRoute({
  getParentRoute: () => sectionRoute,
  path: '$itemId',
  component: ItemPage,
})
