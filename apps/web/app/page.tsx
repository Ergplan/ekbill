import { redirect } from 'next/navigation';

/** Stage 0 has no screens; the kit is the one thing to look at. Stage 1 replaces this with the shell. */
export default function Index() {
  redirect('/kit');
}
