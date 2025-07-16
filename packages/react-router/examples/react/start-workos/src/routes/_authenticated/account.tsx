import { createFileRoute } from '@tanstack/react-router';
import { Box, Flex, Heading, Text, TextField } from '@radix-ui/themes';
import {} from '@tanstack/react-router';
import { getAuth } from '../../authkit/serverFunctions';

export const Route = createFileRoute('/_authenticated/account')({
  component: RouteComponent,
  loader: async ({ context }) => {
    const { user } = context;
    const { role, permissions } = await getAuth();

    const userFields: Array<[label: string, value: string | undefined]> = [
      ['First name', user?.firstName ?? ''],
      ['Last name', user?.lastName ?? ''],
      ['Email', user?.email],
      ['Id', user?.id],
    ];

    if (role) {
      userFields.push(['Role', role]);
    }

    if (permissions) {
      userFields.push(['Permissions', permissions.join(', ')]);
    }

    return userFields;
  },
});

function RouteComponent() {
  const userFields = Route.useLoaderData();
  return (
    <>
      <Flex direction="column" gap="2" mb="7">
        <Heading size="8" align="center">
          Account details
        </Heading>
        <Text size="5" align="center" color="gray">
          Below are your account details
        </Text>
      </Flex>

      {userFields && (
        <Flex direction="column" justify="center" gap="3" width="400px">
          {userFields.map(([label, value]) => (
            <Flex asChild align="center" gap="6" key={String(value)}>
              <label>
                <Text weight="bold" size="3" style={{ width: 100 }}>
                  {label}
                </Text>

                <Box flexGrow="1">
                  <TextField.Root value={String(value) || ''} readOnly />
                </Box>
              </label>
            </Flex>
          ))}
        </Flex>
      )}
    </>
  );
}
