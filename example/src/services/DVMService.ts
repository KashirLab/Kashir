import {
  Filter,
  Kind,
  NostrPublicKey as PublicKey,
  EventId,
  ReqTarget,
} from 'kashir';
import type { EventInterface, Client } from 'kashir';

interface DVMResponse {
  eventIds: string[];
  responseId: string;
  createdAt: number;
}

export class DVMService {
  private readonly DVM_PUBKEY =
    'bb9b5961ac890ed6159172c399273b14f79b34cebad33ee6ca5ba14783528ebe';
  private readonly RESPONSE_KIND = 6300;

  async requestTrendingContent(client: Client): Promise<DVMResponse | null> {
    try {
      console.log('Fetching existing DVM trending responses...');
      const dvmPubkey = PublicKey.parse(this.DVM_PUBKEY);

      const dvmFilter = new Filter()
        .kind(new Kind(this.RESPONSE_KIND))
        .author(dvmPubkey)
        .limit(BigInt(50));

      const events = await client.fetchEvents(
        ReqTarget.auto([dvmFilter]),
        15000
      );

      // Process any found events
      if (events.length > 0) {
        for (let i = 0; i < Math.min(events.length, 3); i++) {
          const response = events[i];
          if (response) {
            if (response.content().length > 0) {
              try {
                const contentJson = JSON.parse(response.content());
                const eventIds: string[] = [];

                if (Array.isArray(contentJson)) {
                  for (const tag of contentJson) {
                    if (
                      Array.isArray(tag) &&
                      tag.length === 2 &&
                      tag[0] === 'e'
                    ) {
                      eventIds.push(tag[1]);
                    }
                  }
                }

                if (eventIds.length > 0) {
                  return {
                    eventIds,
                    responseId: response.id().toString(),
                    createdAt: Number(response.createdAt().asSecs()),
                  };
                }
              } catch {
                // Failed to parse JSON content, continue
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error('💥 DVM request failed:', error);
      return null;
    }
  }

  async fetchEventsByIds(
    client: Client,
    eventIds: string[]
  ): Promise<EventInterface[]> {
    try {
      console.log(`Fetching ${eventIds.length} trending events...`);

      if (eventIds.length === 0) {
        return [];
      }

      const allFetchedEvents: EventInterface[] = [];

      // Fetch events one by one (like nostr-cli)
      for (let i = 0; i < eventIds.length; i++) {
        const eventId = eventIds[i];
        if (!eventId) continue;

        try {
          const parsedEventId = EventId.parse(eventId);
          const workingFilter = new Filter().id(parsedEventId).limit(BigInt(1));

          const events = await client.fetchEvents(
            ReqTarget.auto([workingFilter]),
            5000
          );

          const eventIdHex = parsedEventId.toHex();
          const foundEvent = events.find(
            (event) => event.id().toHex() === eventIdHex
          );
          if (foundEvent) {
            allFetchedEvents.push(foundEvent);
          }
        } catch {
          // Event fetch failed, continue
        }

        // Small delay between requests
        await new Promise<void>((resolve) => setTimeout(resolve, 100));
      }

      // Keep DVM trending order (don't sort by time)
      return allFetchedEvents;
    } catch (error) {
      console.error('Failed to fetch trending events:', error);
      return [];
    }
  }
}
