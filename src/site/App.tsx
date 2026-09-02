import { Masthead } from './components/Masthead';
import { Partners } from './components/Partners';
import { CardDeck } from './components/CardDeck';
import { ContactCard } from './components/ContactCard';
import { CursorGlow } from './components/CursorGlow';
import { Footer } from './components/Footer';

/**
 * The whole page: a masthead, four cards that expand in place, a footer.
 *
 * The earlier version had eleven sections and a marketing hero. Internal
 * feedback was that it read as generated, so the structure is now flat and the
 * detail is opt-in — nothing is asserted at the top that the reader did not ask
 * for.
 */
export function App() {
  return (
    <div className="min-h-screen">
      <CursorGlow />
      <Masthead />
      <Partners />
      <main>
        <CardDeck />
        <ContactCard />
      </main>
      <Footer />
    </div>
  );
}
