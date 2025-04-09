import { Button, Flex, Heading, Text } from '@radix-ui/themes';
import { Link, createFileRoute } from '@tanstack/react-router';
import { getSignInUrl } from '../authkit/serverFunctions';
import SignInButton from '../components/sign-in-button';

export const Route = createFileRoute('/')({
  component: Home,
  loader: async ({ context }) => {
    const { user } = context;
    const url = await getSignInUrl();
    return { user, url };
  },
});

function Home() {
  const { user, url } = Route.useLoaderData();

  return (
    <Flex direction="column" align="center" gap="2">
      {user ? (
        <>
          <Heading size="8">Welcome back{user?.firstName && `, ${user?.firstName}`}</Heading>
          <Text size="5" color="gray">
            You are now authenticated into the application
          </Text>
          <Flex align="center" gap="3" mt="4">
            <Button asChild size="3" variant="soft">
              <Link to="/account">View account</Link>
            </Button>
            <SignInButton url={url} user={user} large />
          </Flex>
        </>
      ) : (
        <>
          <Heading size="8">AuthKit authentication example</Heading>
          <Heading size="7">TanStack Start</Heading>
          <Text size="5" color="gray" mb="4">
            Sign in to view your account details
          </Text>
          <SignInButton user={user} url={url} large />
        </>
      )}
    </Flex>
  );
}
