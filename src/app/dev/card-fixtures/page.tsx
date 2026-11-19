import { notFound } from 'next/navigation';
import { CardFixtureGrid } from './CardFixtureGrid';

export default function CardFixturesPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <CardFixtureGrid />;
}
