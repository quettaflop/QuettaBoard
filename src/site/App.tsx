import { Masthead } from './components/Masthead';
import { CardDeck } from './components/CardDeck';
import { CursorGlow } from './components/CursorGlow';
import { Footer } from './components/Footer';

export function App() {
  return (
    <div className="min-h-screen">
      <CursorGlow />
      <Masthead />
      <main>
        <CardDeck />
      </main>
      <Footer />
    </div>
  );
}
