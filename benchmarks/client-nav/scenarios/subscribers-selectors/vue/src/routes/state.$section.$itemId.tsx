import * as Vue from 'vue'
import { createRoute, useMatches, useParams } from '@tanstack/vue-router'
import {
  stringToSubscriberSeed,
  subscriberGroupSize,
  subscriberIndices,
} from '../../../shared'
import { SubscriberValue } from '../subscriberValue'
import { sectionRoute } from './state.$section'

const ParamSectionSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = useParams({
      strict: false,
      select: (params) => stringToSubscriberSeed(String(params.section ?? '')),
    })

    return () => (
      <SubscriberValue
        kind="paramSection"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const ParamItemSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = useParams({
      strict: false,
      select: (params) => stringToSubscriberSeed(String(params.itemId ?? '')),
    })

    return () => (
      <SubscriberValue
        kind="paramItem"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const ParamObjectSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = useParams({
      strict: false,
      select: (params) => ({
        section: String(params.section ?? ''),
        itemId: String(params.itemId ?? ''),
      }),
    })

    return () => (
      <SubscriberValue
        kind="paramObject"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const ParamSubscribers = Vue.defineComponent({
  setup() {
    return () => (
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
  },
})

const MatchesDepthSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = useMatches({
      select: (matches) => matches.length,
    })

    return () => (
      <SubscriberValue
        kind="matchesDepth"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const MatchObjectSubscriber = Vue.defineComponent({
  props: {
    index: {
      type: Number,
      required: true,
    },
  },
  setup(props) {
    const value = itemRoute.useMatch({
      select: (match) => ({
        id: match.id,
        section: String(match.params.section ?? ''),
        itemId: String(match.params.itemId ?? ''),
      }),
    })

    return () => (
      <SubscriberValue
        kind="matchObject"
        index={props.index}
        value={() => value.value}
      />
    )
  },
})

const MatchSubscribers = Vue.defineComponent({
  setup() {
    return () => (
      <>
        {subscriberIndices.matches.map((index) => {
          if (index < subscriberGroupSize) {
            return <MatchesDepthSubscriber key={index} index={index} />
          }

          return <MatchObjectSubscriber key={index} index={index} />
        })}
      </>
    )
  },
})

const ItemPage = Vue.defineComponent({
  setup() {
    return () => (
      <>
        <ParamSubscribers />
        <MatchSubscribers />
      </>
    )
  },
})

export const itemRoute = createRoute({
  getParentRoute: () => sectionRoute,
  path: '$itemId',
  component: ItemPage,
})
