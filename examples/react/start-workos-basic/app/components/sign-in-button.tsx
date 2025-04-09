import { Button, Flex } from '@radix-ui/themes';
import type { User } from '@workos-inc/node';
import { Link } from '@tanstack/react-router';

export default function SignInButton({ large, user, url }: { large?: boolean; user: User | null; url: string }) {
  if (user) {
    return (
      <Flex gap="3">
        <Button asChild size={large ? '3' : '2'}>
          <Link to="/logout">Sign Out</Link>
        </Button>
      </Flex>
    );
  }

  return (
    <Button asChild size={large ? '3' : '2'}>
      <a href={url}>Sign In{large && ' with AuthKit'}</a>
    </Button>
  );
}
